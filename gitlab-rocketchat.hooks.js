/*jshint  esnext:true*/
// see https://gitlab.com/help/web_hooks/web_hooks for full json posted by GitLab
const NOTIF_COLOR = '#6498CC';
const refParser = (ref) => ref.replace(/^refs\/(?:tags|heads)\/(.+)$/,'$1');

class Script {
	process_incoming_request({request}) {
        
		try {
			var result = null
			switch(request.headers['x-gitlab-event']){
				case 'Push Hook':
					result = this.pushEvent(request.content);
					break;
				case 'Merge Request Hook':
					result = this.mergeRequestEvent(request.content);
					break;
				case 'Note Hook':
					result = this.commentEvent(request.content);
					break;
				case 'Issue Hook':
					result = this.issueEvent(request.content);
					break;
				case 'Tag Push Hook':
					result = this.tagEvent(request.content);
					break;
			}
			var channel = request.url.query['channel']
			if(channel)
				result.content.channel = "#" + channel
			return result  
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
				attachments:[]
			}
		};
	}

	commentEvent(data) {
		const comment = data.object_attributes;
		const user = data.user;
		let text;
		if (data.merge_request) {
			let mr = data.merge_request;
			text = `${user.name} commented on merge request #${mr.id} [${mr.title}](${comment.url})`;

		} else if (data.commit) {
			let commit = data.commit;
			let message = commit.message.replace(/\n[^\s\S]+/, '...').replace(/\n$/,'');
			text = `${user.name} commented on commit [${commit.id.slice(0, 8)} ${message}](${comment.url})`;
		} else if (data.issue) {
			let issue = data.issue;
			text = `${user.name} commented on issue [#${issue.id} ${issue.title}](${comment.url})`;
		} else if (data.snippet) {
			let snippet = data.snippet;
			text = `${user.name} commented on code snippet [#${snippet.id} ${snippet.title}](${comment.url})`;
		}
		return {
			content: {
				username: 'gitlab/' + data.project.name,
				icon_url: data.project.avatar_url || user.avatar_url || '',
				text,
				attachments: [
					{
						text: comment.note,
						color: NOTIF_COLOR
					}
				]
			}
		};
	}

	mergeRequestEvent(data) {
		const user = data.user;
		const mr = data.object_attributes;
		return {
			content: {
				username: `gitlab/${mr.target.name}`,
				icon_url: mr.target.avatar_url || mr.source.avatar_url || user.avatar_url || '',
				text: `${user.name} ${mr.action} Merge Request [#${mr.iid} ${mr.title}](${mr.url})`,
				attachments: [
					{
						text: `${mr.source_branch} into ${mr.target_branch}`,
						color: NOTIF_COLOR
					}
				]
			}
		};
	}

	pushEvent(data) {
		const project = data.project;
		if (data.checkout_sha === null && !data.commits.length) {
			return {
				content: {
					username: `gitlab/${project.name}`,
					text: `${data.user_name} removed branch ${refParser(data.ref)} from [${project.name}](${project.web_url})`,
					icon_url: project.avatar_url || data.user_avatar || '',
					attachments:[]
				}
			};
		}
        	if (data.before == 0) {
        	  return {
			  content: {
				username: `gitlab/${project.name}`,
				text: `${data.user_name} pushed new branch [${refParser(data.ref)}](${project.web_url}/commits/${refParser(data.ref)}) to [${project.name}](${project.web_url}), which is ${data.total_commits_count} commits ahead of master`,
				icon_url: project.avatar_url || data.user_avatar || '',
				attachments: []
			  }
		        };
        	}
		return {
		  content: {
			username: `gitlab/${project.name}`,
			text: `${data.user_name} pushed ${data.total_commits_count} commits to branch [${refParser(data.ref)}](${project.web_url}/commits/${refParser(data.ref)}) in [${project.name}](${project.web_url})`,
			icon_url: project.avatar_url || data.user_avatar || '',
			attachments: [
				{
					text: data.commits.map((commit) => `  - ${new Date(commit.timestamp).toUTCString()} [${commit.id.slice(0, 8)}](${commit.url}) by ${commit.author.name}: ${commit.message.replace(/\s*$/, '')}`).join('\n'),
					color: NOTIF_COLOR
				}
			]
		  }
		};
	}

	tagEvent(data) {
		let tag = refParser(data.ref);
		return {
			content: {
				username: `gitlab/${data.project.name}`,
				icon_url: data.project.avatar_url || data.user_avatar || '',
				text: `${data.user_name} push tag [${tag} ${data.checkout_sha.slice(0,8)}](${data.project.web_url}/tags/${tag})`
			}
		};
	}
}
