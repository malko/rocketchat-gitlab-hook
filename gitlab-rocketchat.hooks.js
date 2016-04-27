/*jshint  esnext:true*/
// see https://gitlab.com/help/web_hooks/web_hooks for full json posted by GitLab
const NOTIF_COLOR = '#6498CC';

class Script {
	process_incoming_request({request}) {
		let gitlabEvent = request.headers['x-gitlab-event'];
		// console is a global helper to improve debug
		// console.log(request.content);
		try {
		  	if (gitlabEvent === 'Push Hook') {
			  return this.pushEvent(request.content);
			}

		  	if (gitlabEvent === 'Merge Request Hook') {
			  return this.mergeRequestEvents(request.content);
			}

			if (gitlabEvent === 'Note Hook') {
				return this.commentEvent(request.content);
			}

			if (gitlabEvent === "Issue Hook") {
				return this.issueEvent(request.content);
			}
		} catch(e) {
			console.log('gitlabevent error', e);
			return {
				error: {
					success: false,
					message: e.message || e
				}
			};
		}
	}

	issueEvent(data) {
		return {
			content: {
				username: data.user.name,
				text: `${data.user.username} ${data.object_attributes.state} an issue _${data.object_attributes.title}_ on ${data.project.name}.
*Description:* ${data.object_attributes.description}.
See: ${data.object_attributes.url}`,
				icon_url: data.user.avatar_url,

			}
		};
	}

	commentEvent(data) {
		let comment = data.object_attributes;
		let user = data.user;
		let text;
		let attachments = [];
		if (data.merge_request) {
			let mr = data.merge_request;
			text = `${user.name} commented on Merge Request #${mr.id} [${mr.title}](${comment.url})`;
			attachments.push({
				text: comment.note,
				color: NOTIF_COLOR
			});
		} else if (data.commit) {
			let commit = data.commit;
			let message = commit.message.replace(/\n[^\s\S]+/, '...').replace(/\n$/,'');
			text = `${user.name} commented on commit [${commit.id.replace(/^(.{8}).*$/, '$1')} ${message}](${comment.url})`;
			attachments.push({
				text: comment.note,
				color: NOTIF_COLOR
			});
		}
		return {
			content: {
				username: 'gitlab/' + data.project.name,
				icon_url: data.project.avatar_url || user.avatar_url || '',
				text,
				attachments
			}
		};
	}

	mergeRequestEvent(data) {
		let user = data.user;
		let mr = data.object_attributes;
		return {
			content: {
				username: 'gitlab/' + mr.target.name,
				icon_url: mr.target.avatar_url || mr.source.avatar_url || user.avatar_url || '',
				attachments: [
					{
						title: `${user.name} ${mr.action} Merge Request #${mr.id} ${mr.title}`,
						title_link: mr.url,
						text: `_${mr.source_branch} into ${mr.target_branch}_`,
						color: NOTIF_COLOR
					}
				]
			}
		};
	}

	pushEvent(data) {
		let project = data.project;
		return {
		  content: {
			username: 'gitlab/' + project.name,
			text: `![${data.user_name}](${data.user_avatar}) ${data.user_name}
pushed ${data.total_commits_count} commits to ${project.name}. See: ${project.web_url}`,
			icon_url: project.avatar_url || data.user_avatar || '',
			attachments: [
				{
					title: data.total_commits_count + ' Commits',
					title_link: project.web_url,
					text: data.commits.map((c) => `  - ${new Date(c.timestamp).toUTCString()} **${c.author.name}**: [${c.message}](${c.url})`).join('\n'),
					color: NOTIF_COLOR
				}
			]
		  }
		};
	}

}