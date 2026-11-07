# Security policy

<!-- Feature: provide a private reporting route and explain user-facing security boundaries without publishing operational records. -->

## Report a vulnerability privately

Email [alaizamichael@gmail.com](mailto:alaizamichael@gmail.com) with the subject **Little by Little security report**.

Include the affected version or commit, platform, a description of the impact, and minimal steps to reproduce using your own account and fictional data. Do not include passwords, private API keys, session tokens, or someone else's manuscript.

Please do not post unresolved vulnerability details in public issues or pull requests. Coordinate disclosure through the private contact above.

## Versions and updates

Include the affected release or commit in every report. When practical, check whether the issue also occurs on the current default branch or latest published release. Avoid testing against other users' accounts or data.

## Data and security boundaries

- Local writing works without a cloud account.
- Cloud sync is optional and transfers the workspace associated with the signed-in account.
- Local manuscripts and exported backups are not encrypted by the application. Cloud sync is not end-to-end encrypted.
- Signing out does not remove local manuscripts; users control their local copies and backups.
- Only public client configuration belongs in application bundles. Administrative credentials must remain outside source control and distributed builds.

See [legal notices](LEGAL.md) for privacy information and contact details, and the [development guide](docs/DEVELOPMENT.md) for generic setup instructions.

## Public documentation

Use placeholders in setup examples. Keep production account inventories, deployment evidence, incident records, and unresolved security findings in access-controlled maintainer records outside this public repository. Keep security-relevant user limitations and published privacy notices available to users.
