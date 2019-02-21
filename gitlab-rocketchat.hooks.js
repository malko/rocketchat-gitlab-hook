/* eslint no-console:0, max-len:0, complexity:0 */
// see https://gitlab.com/help/web_hooks/web_hooks for full json posted by GitLab
const MENTION_ALL_ALLOWED = false; // <- check that bot permission 'mention-all' are activated in rocketchat before passing this to true.
const NOTIF_COLOR = '#6498CC';
const IGNORE_CONFIDENTIAL = true;
const IGNORE_UNKNOWN_EVENTS = false;
const IGNORE_ERROR_MESSAGES = false;
const USE_ROCKETCHAT_AVATAR = false;
const DEFAULT_AVATAR = null; // <- null means use the avatar from settings if no other is available
const STATUSES_COLORS = {
	success: '#2faa60',
	pending: '#e75e40',
	failed: '#d22852',
	canceled: '#5c5c5c',
	created: '#ffc107',
	running: '#607d8b',
};
const ACTION_VERBS = {
	create: 'created',
	destroy: 'removed',
	update: 'updated',
	rename: 'renamed',
	transfer: 'transferred',
	add: 'added',
	remove: 'removed',
};
const ATTACHMENT_TITLE_SIZE = 10; // Put 0 here to have not title as in previous versions
const refParser = (ref) => ref.replace(/^refs\/(?:tags|heads)\/(.+)$/, '$1');
const displayName = (name) => (name && name.toLowerCase().replace(/\s+/g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
const atName = (user) => (user && user.name ? '@' + displayName(user.name) : '');
const makeAttachment = (author, text, timestamp, color) => {
	const currentTime = (new Date()).toISOString();
	const attachment = {
		author_name: author ? displayName(author.name) : '',
		author_icon: author ? author.avatar_url : '',
		ts: timestamp || currentTime,
		text,
		color: color || NOTIF_COLOR
	};
	if (ATTACHMENT_TITLE_SIZE > 0) {
		attachment.title = text.substring(0, ATTACHMENT_TITLE_SIZE) + '...';
	}

	return attachment;
};
const pushUniq = (array, val) => ~array.indexOf(val) || array.push(val); // eslint-disable-line

class Script { // eslint-disable-line
	process_incoming_request({ request }) {
		try {
			let result = null;
			const channel = request.url.query.channel;
			const event = request.headers['x-gitlab-event'];
			switch (event) {
				case 'Push Hook':
					result = this.pushEvent(request.content);
					break;
				case 'Merge Request Hook':
					result = this.mergeRequestEvent(request.content);
					break;
				case 'Note Hook':
					result = this.commentEvent(request.content);
					break;
				case 'Confidential Issue Hook':
				case 'Issue Hook':
					result = this.issueEvent(request.content, event);
					break;
				case 'Tag Push Hook':
					result = this.tagEvent(request.content);
					break;
				case 'Pipeline Hook':
				case 'Pipeline Event':
					result = this.pipelineEvent(request.content);
					break;
				case 'Build Hook':
					result = this.buildEvent(request.content);
					break;
				case 'Wiki Page Hook':
					result = this.wikiEvent(request.content);
					break;
				case 'System Hook':
					result = this.systemEvent(request.content);
					break;
				default:
					if (IGNORE_UNKNOWN_EVENTS) {
						console.log('gitlabevent unknown', event);
						return { error: { success: false, message: `unknonwn event ${event}` } };
					}
					result = IGNORE_UNKNOWN_EVENTS ? null : this.unknownEvent(request, event);
					break;
			}
			if (result && result.content && channel) {
				result.content.channel = '#' + channel;
			}
			return result;
		} catch (e) {
			console.log('gitlabevent error', e);
			return this.createErrorChatMessage(e);
		}
	}

	createErrorChatMessage(error) {
		if (IGNORE_ERROR_MESSAGES) {
			return { error: { success: false, message: `gitlabevent error: ${error.message}` } };
		}
		return {
			content: {
				username: 'Rocket.Cat ErrorHandler',
				text: 'Error occured while parsing an incoming webhook request. Details attached.',
				icon_url: USE_ROCKETCHAT_AVATAR ? null : DEFAULT_AVATAR,
				attachments: [
					{
						text: `Error: '${error}', \n Message: '${error.message}', \n Stack: '${error.stack}'`,
						color: NOTIF_COLOR
					}
				]
			}
		};
	}

	unknownEvent(data, event) {
		const user_avatar = data.user ? data.user.avatar_url : (data.user_avatar || DEFAULT_AVATAR);
		return {
			content: {
				username: data.user ? data.user.name : (data.user_name || 'Unknown user'),
				text: `Unknown event '${event}' occured. Data attached.`,
				icon_url: USE_ROCKETCHAT_AVATAR ? null : user_avatar,
				attachments: [
					{
						text: `${JSON.stringify(data, null, 4)}`,
						color: NOTIF_COLOR
					}
				]
			}
		};
	}
	issueEvent(data, event) {
		if (event === 'Confidential Issue Hook' && IGNORE_CONFIDENTIAL) {
			return false;
		}
		const project = data.project || data.repository;
		const state = data.object_attributes.state;
		const action = data.object_attributes.action;
		const time = data.object_attributes.updated_at;
		const project_avatar = project.avatar_url || data.user.avatar_url || DEFAULT_AVATAR;
		let user_action = state;
		let assigned = '';

		if (action === 'update') {
			user_action = 'updated';
		}

		if (data.assignee) {
			assigned = `*Assigned to*: @${data.assignee.username}\n`;
		}

		return {
			content: {
				username: 'gitlab/' + project.name,
				icon_url: USE_ROCKETCHAT_AVATAR ? null : project_avatar,
				text: (data.assignee && data.assignee.name !== data.user.name) ? atName(data.assignee) : '',
				attachments: [
					makeAttachment(
						data.user,
						`${user_action} an issue _${data.object_attributes.title}_ on ${project.name}.
*Description:* ${data.object_attributes.description}.
${assigned}
See: ${data.object_attributes.url}`,
						time
					)
				]
			}
		};
	}

	commentEvent(data) {
		const project = data.project || data.repository;
		const comment = data.object_attributes;
		const user = data.user;
		const avatar = project.avatar_url || user.avatar_url || DEFAULT_AVATAR;
		const at = [];
		let text;
		if (data.merge_request) {
			const mr = data.merge_request;
			const lastCommitAuthor = mr.last_commit && mr.last_commit.author;
			if (mr.assignee && mr.assignee.name !== user.name) {
				at.push(atName(mr.assignee));
			}
			if (lastCommitAuthor && lastCommitAuthor.name !== user.name) {
				pushUniq(at, atName(lastCommitAuthor));
			}
			text = `commented on MR [#${mr.id} ${mr.title}](${comment.url})`;
		} else if (data.commit) {
			const commit = data.commit;
			const message = commit.message.replace(/\n[^\s\S]+/, '...').replace(/\n$/, '');
			if (commit.author && commit.author.name !== user.name) {
				at.push(atName(commit.author));
			}
			text = `commented on commit [${commit.id.slice(0, 8)} ${message}](${comment.url})`;
		} else if (data.issue) {
			const issue = data.issue;
			text = `commented on issue [#${issue.id} ${issue.title}](${comment.url})`;
		} else if (data.snippet) {
			const snippet = data.snippet;
			text = `commented on code snippet [#${snippet.id} ${snippet.title}](${comment.url})`;
		}
		return {
			content: {
				username: 'gitlab/' + project.name,
				icon_url: USE_ROCKETCHAT_AVATAR ? null : avatar,
				text: at.join(' '),
				attachments: [
					makeAttachment(user, `${text}\n${comment.note}`, comment.updated_at)
				]
			}
		};
	}

	mergeRequestEvent(data) {
		const user = data.user;
		const mr = data.object_attributes;
		const assignee = mr.assignee;
		const avatar = mr.target.avatar_url || mr.source.avatar_url || user.avatar_url || DEFAULT_AVATAR;
		let at = [];

		if (mr.action === 'open' && assignee) {
			at = '\n' + atName(assignee);
		} else if (mr.action === 'merge') {
			const lastCommitAuthor = mr.last_commit && mr.last_commit.author;
			if (assignee && assignee.name !== user.name) {
				at.push(atName(assignee));
			}
			if (lastCommitAuthor && lastCommitAuthor.name !== user.name) {
				pushUniq(at, atName(lastCommitAuthor));
			}
		}
		return {
			content: {
				username: `gitlab/${mr.target.name}`,
				icon_url: USE_ROCKETCHAT_AVATAR ? null : avatar,
				text: at.join(' '),
				attachments: [
					makeAttachment(user, `${mr.action} MR [#${mr.iid} ${mr.title}](${mr.url})\n${mr.source_branch} into ${mr.target_branch}`, mr.updated_at)
				]
			}
		};
	}

	pushEvent(data) {
		const project = data.project || data.repository;
		const web_url = project.web_url || project.homepage;
		const user = {
			name: data.user_name,
			avatar_url: data.user_avatar
		};
		const avatar = project.avatar_url || data.user_avatar || DEFAULT_AVATAR;
		// branch removal
		if (data.checkout_sha === null && !data.commits.length) {
			return {
				content: {
					username: `gitlab/${project.name}`,
					icon_url: USE_ROCKETCHAT_AVATAR ? null : avatar,
					attachments: [
						makeAttachment(user, `removed branch ${refParser(data.ref)} from [${project.name}](${web_url})`)
					]
				}
			};
		}
		// new branch
		if (data.before == 0) { // eslint-disable-line
			return {
				content: {
					username: `gitlab/${project.name}`,
					icon_url: USE_ROCKETCHAT_AVATAR ? null : avatar,
					attachments: [
						makeAttachment(user, `pushed new branch [${refParser(data.ref)}](${web_url}/commits/${refParser(data.ref)}) to [${project.name}](${web_url}), which is ${data.total_commits_count} commits ahead of master`)
					]
				}
			};
		}
		return {
			content: {
				username: `gitlab/${project.name}`,
				icon_url: USE_ROCKETCHAT_AVATAR ? null : avatar,
				attachments: [
					makeAttachment(user, `pushed ${data.total_commits_count} commits to branch [${refParser(data.ref)}](${web_url}/commits/${refParser(data.ref)}) in [${project.name}](${web_url})`),
					{
						text: data.commits.map((commit) => `  - ${new Date(commit.timestamp).toUTCString()} [${commit.id.slice(0, 8)}](${commit.url}) by ${commit.author.name}: ${commit.message.replace(/\s*$/, '')}`).join('\n'),
						color: NOTIF_COLOR
					}
				]
			}
		};
	}

	tagEvent(data) {
		const project = data.project || data.repository;
		const web_url = project.web_url || project.homepage;
		const tag = refParser(data.ref);
		const user = {
			name: data.user_name,
			avatar_url: data.user_avatar
		};
		const avatar = project.avatar_url || data.user_avatar || DEFAULT_AVATAR;
		let message;
		if (data.checkout_sha === null) {
			message = `deleted tag [${tag}](${web_url}/tags/)`;
		} else {
			message = `pushed tag [${tag} ${data.checkout_sha.slice(0, 8)}](${web_url}/tags/${tag})`;
		}
		return {
			content: {
				username: `gitlab/${project.name}`,
				icon_url: USE_ROCKETCHAT_AVATAR ? null : avatar,
				text: MENTION_ALL_ALLOWED ? '@all' : '',
				attachments: [
					makeAttachment(user, message)
				]
			}
		};
	}

	pipelineEvent(data) {
		const project = data.project || data.repository;
		const commit = data.commit;
		const user = {
			name: data.user_name,
			avatar_url: data.user_avatar
		};
		const pipeline = data.object_attributes;
		const pipeline_time = pipeline.finished_at || pipeline.created_at;
		const avatar = project.avatar_url || data.user_avatar || DEFAULT_AVATAR;

		return {
			content: {
				username: `gitlab/${project.name}`,
				icon_url: USE_ROCKETCHAT_AVATAR ? null : avatar,
				attachments: [
					makeAttachment(user, `pipeline returned *${pipeline.status}* for commit [${commit.id.slice(0, 8)}](${commit.url}) made by *${commit.author.name}*`, pipeline_time, STATUSES_COLORS[pipeline.status])
				]
			}
		};
	}

	buildEvent(data) {
		const user = {
			name: data.user_name,
			avatar_url: data.user_avatar
		};

		return {
			content: {
				username: `gitlab/${data.repository.name}`,
				icon_url: USE_ROCKETCHAT_AVATAR ? null : DEFAULT_AVATAR,
				attachments: [
					makeAttachment(user, `build named *${data.build_name}* returned *${data.build_status}* for [${data.project_name}](${data.repository.homepage})`, null, STATUSES_COLORS[data.build_status])
				]
			}
		};
	}

	wikiPageTitle(wiki_page) {
		if (wiki_page.action === 'delete') {
			return wiki_page.title;
		}

		return `[${wiki_page.title}](${wiki_page.url})`;
	}

	wikiEvent(data) {
		const user_name = data.user.name;
		const project = data.project;
		const project_path = project.path_with_namespace;
		const wiki_page = data.object_attributes;
		const wiki_page_title = this.wikiPageTitle(wiki_page);
		const user_action = ACTION_VERBS[wiki_page.action] || 'modified';
		const avatar = project.avatar_url || data.user.avatar_url || DEFAULT_AVATAR;

		return {
			content: {
				username: project_path,
				icon_url: USE_ROCKETCHAT_AVATAR ? null : avatar,
				text: `The wiki page ${wiki_page_title} was ${user_action} by ${user_name}`
			}
		};
	}

	systemEvent(data) {
		const event_name = data.event_name;
		const [, eventType] = data.event_name.split('_');
		const action = eventType in ACTION_VERBS ? ACTION_VERBS[eventType] : '';
		let text = '';
		switch (event_name) {
			case 'project_create':
			case 'project_destroy':
			case 'project_update':
				text = `Project \`${data.path_with_namespace}\` ${action}.`;
				break;
			case 'project_rename':
			case 'project_transfer':
				text = `Project \`${data.old_path_with_namespace}\` ${action} to \`${data.path_with_namespace}\`.`;
				break;
			case 'user_add_to_team':
			case 'user_remove_from_team':
				text = `User \`${data.user_username}\` was ${action} to project \`${data.project_path_with_namespace}\` with \`${data.project_access}\` access.`;
				break;
			case 'user_add_to_group':
			case 'user_remove_from_group':
				text = `User \`${data.user_username}\` was ${action} to group \`${data.group_path}\` with \`${data.group_access}\` access.`;
				break;
			case 'user_create':
			case 'user_destroy':
				text = `User \`${data.username}\` was ${action}.`;
				break;
			case 'user_rename':
				text = `User \`${data.old_username}\` was ${action} to \`${data.username}\`.`;
				break;
			case 'key_create':
			case 'key_destroy':
				text = `Key \`${data.username}\` was ${action}.`;
				break;
			case 'group_create':
			case 'group_destroy':
				text = `Group \`${data.path}\` was ${action}.`;
				break;
			case 'group_rename':
				text = `Group \`${data.old_full_path}\` was ${action} to \`${data.full_path}\`.`;
				break;
			default:
				text = 'Unknown system event';
				break;
		}

		return {
			content: {
				text: `${text}`,
				attachments: [
					{
						text: `${JSON.stringify(data, null, 4)}`,
						color: NOTIF_COLOR
					}
				]
			}
		};
	}
}
