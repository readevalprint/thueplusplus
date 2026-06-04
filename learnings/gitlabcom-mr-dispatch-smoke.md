# GitLab.com MR dispatch smoke

Temporary branch-only file for GLKB #372 negative CI dispatch smoke.
This branch intentionally changes a non-submission path so the GitLab.com MR
pipeline must run the ordinary `make test` path instead of submission validation.
