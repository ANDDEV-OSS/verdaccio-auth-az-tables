# verdaccio-auth-az-tables
Azure Storage Table Auth plugin for Verdaccio

[![License](https://img.shields.io/github/license/ANDDEV-OSS/verdaccio-auth-az-tables.svg)](https://github.com/ANDDEV-OSS/verdaccio-auth-az-tables/blob/master/LICENSE.md)
[![NPM](https://img.shields.io/npm/v/@anddev-oss/verdaccio-auth-az-tables)](https://www.npmjs.com/package/@anddev-oss/verdaccio-auth-az-tables)
[![YouTube](https://img.shields.io/badge/Youtube-&DEV-red.svg?logo=youtube)](https://www.youtube.com/Voltstro)

[Azure Table Storage](https://learn.microsoft.com/en-us/azure/storage/common/storage-introduction) auth plugin for [Verdaccio 6](https://verdaccio.org/).

## Features

- Stores users and groups in Azure Table Storage.

## Getting Started

### Prerequisites

- An Azure Storage account with two tables (verdaccioUsers, verdaccioGroups)
- Local dev environment (vscode, podman/docker, az cli)


### Development

To contribute to this project pull the repo and make sure you have Docker / Podman installed.
Copy verdaccio-config.yaml-example to verdaccio-config.yaml and update with your development Azure Storage Account name, users and group table names.

If you are wishing to use AZ CLI context for authentication, you have 2 options:

1) Configure ./devcontainers/.env with your development Azure Subscription ID as below and your local AZ CLI context will be copied into the devcontainer and made active.

```bash
expected_az_context="00000000-0000-0000-0000-000000000000"
```

2) Load devcontainer as per usual and login locally within the devcontainer.

### Install

Install like any other verdaccio plugin.

```bash
npm install @anddev-oss/verdaccio-auth-az-tables
```

### Configuration

To use this plugin, you will need to add the plugin to your verdaccio's config auth option.

```yaml
auth:
  '@anddev-oss/verdaccio-auth-az-tables':
    azure:
        # (Required) Azure Storage Account name.
      accountName:

      # (Required) Azure Table Storage name for Verdaccio Users.
      usersTable: verdaccioUsers

      # (Required) Azure Table Storage name for Verdaccio Groups.
      groupsTable: verdaccioGroups
```

## Authors

* **&DEV Limited** - *Initial work* - [&DEV OSS](https://github.com/ANDDEV-OSS)