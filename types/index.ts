export interface AzureConfig {
  /**
   * The name of the Azure Storage account.
   */
  accountName: string;

  /**
   * The access key for the Azure Storage account.
   * Optional if another authentication method is provided.
   */
  accountKey?: string;

  /**
   * Shared Access Signature (SAS) token for authenticating access.
   * Optional if another authentication method is provided.
   */
  sasToken?: string;

  /**
   * The name of the table for storing user information.
   */
  usersTable: string;

  /**
   * The name of the table for storing group information.
   */
  groupsTable: string;

}

export interface CustomConfig {

  /**
   * Azure Table Storage configuration.
   */
  azure: AzureConfig;
}
