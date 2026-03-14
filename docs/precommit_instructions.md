Pre-commit secret scanning setup (AMeP Protocol)

- Prereqs:
  - Python installed
- Steps:
  - Install pre-commit: pip install pre-commit
  - Install dependencies and install git hooks:
    - pre-commit install
  - Run a full scan: pre-commit run --all-files

- Notes:
  - The repo includes a Detect Secrets hook via .pre-commit-config.yaml
  - You can add additional secret scanners as needed (e.g., git-secrets)
