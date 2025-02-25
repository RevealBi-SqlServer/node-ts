# Settig up a Node Server for Reveal 

This documentation covers the setup and usage of a Reveal BI server using Node.js and TypeScript. The server provides data visualization capabilities with features for authentication, data source management, and dashboard handling.

## Table of Contents

- [Settig up a Node Server for Reveal](#settig-up-a-node-server-for-reveal)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [API Endpoints](#api-endpoints)
    - [GET `/dashboards/names`](#get-dashboardsnames)
  - [Key Components](#key-components)
    - [User Context Provider](#user-context-provider)
    - [Authentication Provider](#authentication-provider)
    - [Data Source Provider](#data-source-provider)
    - [Data Source Item Provider](#data-source-item-provider)
    - [Data Source Item Filter](#data-source-item-filter)
    - [Dashboard Provider](#dashboard-provider)

## Overview

This server implementation uses the Reveal SDK for Node.js to create a backend service that handles:
- User authentication and context management
- SQL Server data source connections
- Dashboard storage and retrieval
- Role-based access control for data sources

The server connects to a SQL Server database and provides various features like stored procedure execution, custom queries, and row-level security.

## Installation

1. Install dependencies:

```bash
npm install express fs path reveal-sdk-node cors http util stream
```

2. Create the dashboard directory:

```bash
mkdir myDashboards
```

3. Start the server:

```bash
npm start
```

The server will run on port 5111.

## Configuration

The main configuration is done through the `RevealOptions` object, which includes:

- User context provider
- Authentication provider
- Data source provider
- Data source item provider
- Data source item filter
- Dashboard providers

Example configuration:

```typescript
const revealOptions: RevealOptions = {
  userContextProvider: userContextProvider,
  authenticationProvider: authenticationProvider,
  dataSourceProvider: dataSourceProvider,
  dataSourceItemProvider: dataSourceItemProvider,
  dataSourceItemFilter: dataSourceItemFilter,
  dashboardProvider: dashboardProvider,
  dashboardStorageProvider: dashboardStorageProvider,
}
```

## API Endpoints

### GET `/dashboards/names`

Returns a list of available dashboards from the configured dashboard directory.

**Response:**
```json
[
  { "name": "dashboard1" },
  { "name": "dashboard2" }
]
```

## Key Components

### User Context Provider

Extracts user information from HTTP headers and creates a `RVUserContext` object. This context is used throughout the application for personalization and security.

```typescript
const userContextProvider = (request: IncomingMessage): RVUserContext => {
  let userId = request.headers['x-header-customerid'] as string | undefined;
  // Other header extractions...
  
  // Determine roles and create properties
  const props = new Map<string, any>();
  props.set("Role", role);
  
  return new RVUserContext(userId || "", props);
};
```

The user context is used to:
- Implement row-level security
- Control access to specific data sources
- Personalize dashboards and queries

### Authentication Provider

Handles authentication for data sources. In this implementation, it provides credentials for SQL Server connections.

```typescript
const authenticationProvider = async (userContext: IRVUserContext | null, dataSource: RVDashboardDataSource) => {
  if (dataSource instanceof RVSqlServerDataSource) {
    return new RVUsernamePasswordDataSourceCredential("dev", "dev");
  }
  return null;
}
```

### Data Source Provider

Configures data source connection details like host and database name.

```typescript
const dataSourceProvider = async (userContext: IRVUserContext | null, dataSource: RVDashboardDataSource) => {
  if (dataSource instanceof RVSqlServerDataSource) {
    dataSource.host = "infragistics.local";
    dataSource.database = "devtest";
  }
  return dataSource;
}
```

### Data Source Item Provider

Handles data source items, including stored procedures, custom queries, and table access. This provider allows for:

1. Executing stored procedures with parameters
2. Creating custom SQL queries
3. Implementing row-level security
4. Parameterizing queries based on user context

```typescript
const dataSourceItemProvider = async (userContext: IRVUserContext | null, dataSourceItem: RVDataSourceItem) => {
  if (dataSourceItem instanceof RVSqlServerDataSourceItem) {
    // Update underlying data source
    dataSourceProvider(userContext, dataSourceItem.dataSource);
    
    // Implement custom logic based on dataSourceItem.id
    if (dataSourceItem.id == "CustOrderHist") {
      dataSourceItem.procedure = "CustOrderHist";
      dataSourceItem.procedureParameters = {"@CustomerID": userContext?.userId};  
    }
    
    // Row-level security example
    if (dataSourceItem.table === "Customers" || dataSourceItem.table === "Orders") {
      dataSourceItem.customQuery = `SELECT * FROM [${dataSourceItem.table}] WHERE CustomerID = '${userContext?.userId}'`;
    }
  }
  return dataSourceItem;
}
```

### Data Source Item Filter

Controls which data sources are available to users based on their roles.

```typescript
const dataSourceItemFilter = async (userContext: IRVUserContext | null, dataSourceItem: RVDataSourceItem): Promise<boolean> => {
  if (dataSourceItem instanceof RVSqlServerDataSourceItem) {
    // Create an Include or Exclude list
    const includedList = ["Customers", "Orders", "'Order Details'"];
    
    // Check user role
    const role = userContext?.properties.get("Role") || "User";
    
    if (role === "User") {
      // Restrict regular users to specific tables
      if (dataSourceItem.table && includedList.includes(dataSourceItem.table)) {
        return true;
      }
    } else {
      // Admins can access everything
      return true;
    }
  }
  return false;
};
```

### Dashboard Provider

Handles loading and saving dashboards from the file system.

```typescript
const dashboardProvider = async (userContext:IRVUserContext | null, dashboardId: string) => {
  return fs.createReadStream(`${dashboardDirectory}/${dashboardId}.rdash`);
}

const dashboardStorageProvider = async (userContext: IRVUserContext | null, dashboardId: string, stream: fs.ReadStream) => {
  await pipelineAsync(stream, fs.createWriteStream(`${dashboardDirectory}/${dashboardId}.rdash`));
}
```

For more information, refer to the official [RevealBI documentation](https://help.revealbi.io/web/getting-started-server-node-typescript/).