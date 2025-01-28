import buildDebug from 'debug';
import { getInternalError } from '@verdaccio/commons-api';
import {
  AuthAccessCallback,
  AuthCallback,
  IPluginAuth,
  Logger,
  PackageAccess,
  PluginOptions,
  RemoteUser,
} from '@verdaccio/types';
import { CustomConfig, AzureConfig } from '../types/index';
import { TableClient, AzureNamedKeyCredential, AzureSASCredential } from "@azure/data-tables";
import {
  DefaultAzureCredential,
} from "@azure/identity";
import argon2 from 'argon2';

const debug = buildDebug('verdaccio:plugin:azureTablesAuth');

export default class AuthCustomPlugin implements IPluginAuth<CustomConfig> {
  public logger: Logger;
  private usersTableClient!: TableClient;
  private groupsTableClient!: TableClient;

  constructor(config: CustomConfig, options: PluginOptions<CustomConfig>) {
    this.logger = options.logger;

    // Initialize Azure Table Storage clients
    this.initializeTableClients(config.azure);
  }

  private initializeTableClients(azureConfig: AzureConfig): void {
    if (!azureConfig.accountName || !azureConfig.usersTable || !azureConfig.groupsTable) {
      throw new Error('Azure configuration must include accountName, usersTable, and groupsTable.');
    }
  
    const serviceUrl = `https://${azureConfig.accountName}.table.core.windows.net`;
    let credential;
  
    if (azureConfig.accountKey) {
      debug(`Account Key Authentication`);
      credential = new AzureNamedKeyCredential(azureConfig.accountName, azureConfig.accountKey);
    } else if (azureConfig.sasToken) {
      debug(`SAS Token Authentication`);
      credential = new AzureSASCredential(azureConfig.sasToken);
    } else {
      // Default to DefaultAzureCredential (e.g., system-assigned identity or fallback)
      debug(`Fallback Default Azure Credential Authentication`);
      credential = new DefaultAzureCredential();
    }
  
    this.usersTableClient = new TableClient(serviceUrl, azureConfig.usersTable, credential);
    this.groupsTableClient = new TableClient(serviceUrl, azureConfig.groupsTable, credential);
  }

  public authenticate(user: string, password: string, cb: AuthCallback): void {
    this.usersTableClient.getEntity("User", user)
      .then((userEntity) => {
        if (!userEntity || !userEntity.Password) {
          debug(`User ${user} not found or missing password`);
          return cb(null, false); // Indicate failure
        }

        const hashedPassword = userEntity.Password as string;
        this.verifyPassword(password, hashedPassword)
          .then((isValid) => {
            if (isValid) {
              // Parse groups from the user entity
              const groups = JSON.parse(userEntity.Groups as string) || [];
              debug(`User ${user} authenticated successfully. Groups: ${groups}`);
              return cb(null, groups); // Indicate success with groups
            } else {
              debug(`Password mismatch for user ${user}`);
              return cb(null, false); // Indicate failure
            }
          })
          .catch((passwordError) => {
            this.logger.error({ error: passwordError }, 'Error verifying password');
            return cb(getInternalError('Error verifying password'), false);
          });
      })
      .catch((error) => {
        this.logger.error({ error }, 'Error retrieving user');
        return cb(getInternalError('Authentication error'), false); // Indicate failure on error
      });
  }

  public allow_access(user: RemoteUser, pkg: PackageAccess, cb: AuthAccessCallback): void {
    const isAllowed = pkg?.access?.some(group => user.groups.includes(group));
    return cb(null, isAllowed || false);
  }

  public allow_publish(user: RemoteUser, pkg: PackageAccess, cb: AuthAccessCallback): void {
    const isAllowed = pkg?.publish?.some(group => user.groups.includes(group));
    return cb(null, isAllowed || false);
  }

  public allow_unpublish(user: RemoteUser, pkg: PackageAccess, cb: AuthAccessCallback): void {
    const isAllowed = pkg?.publish?.some(group => user.groups.includes(group));
    return cb(null, isAllowed || false);
  }

  private async getUserGroups(username: string): Promise<string[]> {
    try {
      const groupEntities = this.groupsTableClient.listEntities({ queryOptions: { filter: `PartitionKey eq 'Group' and RowKey eq '${username}'` } });

      const groups: string[] = [];
      for await (const entity of groupEntities) {
        if (entity.GroupName) {
          groups.push(entity.GroupName as string);
        }
      }
      return groups;
    } catch (error) {
      this.logger.error({ error }, 'Error retrieving user groups');
      return [];
    }
  }

  public async adduser(username: string, password: string, cb: AuthCallback): Promise<void> {
    debug(`adduser ${username}`);
    try {
      // Default group for new users
      const defaultGroup = 'users';

      // Check if the user already exists
      const existingUser = await this.usersTableClient.getEntity("User", username).catch(() => null);
      if (existingUser) {
        debug(`User ${username} already exists.`);
        return cb(getInternalError('User already exists'), false); // Handle duplicate user
      }

      // Hash the password
      const hashedPassword = await this.hashPassword(password);

      // Add user entity with an empty group array
      await this.usersTableClient.createEntity({
        partitionKey: 'User',
        rowKey: username,
        Password: hashedPassword,
        Groups: JSON.stringify([defaultGroup]), // Initialize with default group
        CreatedAt: new Date().toISOString(),
      });
      debug(`User ${username} added successfully.`);

      // Ensure the default group exists in the verdaccioGroups table
      const groupPartitionKey = 'Group';
      const groupRowKey = defaultGroup;

      const existingGroup = await this.groupsTableClient.getEntity(groupPartitionKey, groupRowKey).catch(() => null);

      if (!existingGroup) {
        debug(`Group ${defaultGroup} does not exist. Creating it.`);
        await this.groupsTableClient.createEntity({
          partitionKey: groupPartitionKey,
          rowKey: groupRowKey,
          GroupName: defaultGroup,
          Description: 'Default group for new users',
          CreatedAt: new Date().toISOString(),
        });
        debug(`Group ${defaultGroup} created successfully.`);
      } else {
        debug(`Group ${defaultGroup} already exists.`);
      }

      return cb(null, []); // Success
    } catch (error) {
      this.logger.error({ error }, `Error adding user ${username}`);
      return cb(getInternalError('Failed to add user'), false); // Failure
    }
  }

  public async addUserToGroups(username: string, groups: string[]): Promise<void> {
    try {
      // Fetch the existing user entity
      const userEntity = await this.usersTableClient.getEntity("User", username);
      if (!userEntity) {
        throw new Error(`User ${username} does not exist.`);
      }

      // Parse existing groups and merge with new ones
      const existingGroups = JSON.parse(userEntity.Groups as string) || [];
      const updatedGroups = Array.from(new Set([...existingGroups, ...groups])); // Deduplicate

      // Update user entity with new groups
      await this.usersTableClient.updateEntity({
        partitionKey: 'User',
        rowKey: username,
        Groups: JSON.stringify(updatedGroups), // Update groups as JSON array
      }, 'Merge');
      debug(`User ${username} updated with groups: ${updatedGroups}`);

      // Ensure all groups exist in the verdaccioGroups table
      for (const group of groups) {
        const groupPartitionKey = 'Group';
        const groupRowKey = group;

        const existingGroup = await this.groupsTableClient.getEntity(groupPartitionKey, groupRowKey).catch(() => null);

        if (!existingGroup) {
          debug(`Group ${group} does not exist. Creating it.`);
          await this.groupsTableClient.createEntity({
            partitionKey: groupPartitionKey,
            rowKey: groupRowKey,
            GroupName: group,
            Description: `Group ${group}`,
            CreatedAt: new Date().toISOString(),
          });
          debug(`Group ${group} created successfully.`);
        }
      }
    } catch (error) {
      this.logger.error({ error }, `Error updating user ${username} with groups`);
      throw error;
    }
  }

  private async hashPassword(password: string): Promise<string> {
    return await argon2.hash(password);
  }

  private async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    try {
      // argon2.verify returns true if the password matches the hash
      return await argon2.verify(hashedPassword, password);
    } catch (error) {
      this.logger.error({ error }, 'Error verifying password');
      return false; // Return false on error
    }
  }
}