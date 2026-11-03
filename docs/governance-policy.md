# Mosaic workspace governance policy

**Status:** starter policy for demo review. A workspace owner should tailor and approve it before real users or sensitive data are added.

## Acceptable use

Use the studio for lawful creative, research, and productivity work that follows applicable organizational rules. Do not request or create content intended to facilitate violence, exploitation, fraud, harassment, privacy invasion, or other harmful or unlawful conduct. Do not use generated outputs as the sole basis for consequential decisions about people. Review generated content for accuracy, rights, bias, and audience fit before sharing or acting on it.

Safety checks support this policy; they can make mistakes. A moderation pass is not an endorsement or proof that a result is safe, accurate, or legally compliant.

## Data handling

- Submit only information you are authorized to use. Avoid passwords, access tokens, payment data, health details, and unnecessary personal or confidential information.
- For the demo, do not submit real personal or confidential data. The current scaffold has no durable product audit store, but the configured model gateway may process and retain requests under its own settings and terms.
- Production operators must publish retention, deletion, residency, access-control, and provider-processing details before enabling user data.
- Keep API keys in server-side secrets. Limit access to logs and traces; redact prompts and outputs unless their collection is approved and necessary.
- Label generated media when it is presented as authentic material or when audience expectations require disclosure. Preserve provenance metadata where available.

## Misuse and incident reporting

Report suspected harmful output, unauthorized data exposure, prompt injection, or policy bypass to the workspace administrator or designated security contact. Include the approximate time, affected feature, and a concise description; avoid forwarding sensitive prompts broadly. The owner should restrict access when needed, preserve relevant evidence under approved retention rules, assess provider exposure, notify appropriate internal responders, and document mitigation. Add an in-product reporting route and named contact before production launch.

## Admin responsibilities

Configure model access and spending limits, review provider retention terms, restrict access by role, maintain incident contacts, and audit moderation quality. Test both allowed and blocked examples before changing models or safety settings. Do not claim that dashboard sample data, demo safety indicators, or an unconfigured service represent actual controls.
