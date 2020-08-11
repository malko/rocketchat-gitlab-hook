# RocketChat and GitLab integration

Add GitLab notifications via a new WebHook in Rocket.Chat

This repository only contains a single  rocket chat integration script.
Go there https://rocket.chat/docs/administrator-guides/integrations/gitlab for more info about using it

1. Add GitLab notifications via a new WebHook in Rocket.Chat
1. In Rocket.Chat go to "Administration"->"Integrations" and create "New Integration"
  - Choose Incoming WebHook
  - Follow all instructions like Enable, give it a name, link to channel etc.
  - Set "Enable Script" to true and enter the javascript in the "Script" box
  - Press Save changes
1. Copy the Webhook URL (added just below the script box)
1. Go to your GitLab project, ie. `https://gitlab.com/<username>/<project>/hooks`.
  - It's in the project "Settings" under Webhooks menu GitLab.
1. Add a new webhook by pasting the Rocket.Chat URL from previous step.
  - select at least 1 checkbox and press "Add Webhook"
1. Test the webhook with the "Test Hook" button in itLab, a topbar should appear with more info (success or failure)
