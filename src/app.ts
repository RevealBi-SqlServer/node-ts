// https://help.revealbi.io/web/getting-started-server-node-typescript/
import express, { Application } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import reveal,
{
	IRVUserContext,
	RevealOptions,
	RVDashboardDataSource,
	RVDataSourceItem,
	RVSqlServerDataSource,
	RVSqlServerDataSourceItem,
	RVUserContext,
	RVUsernamePasswordDataSourceCredential
} from 'reveal-sdk-node';
import cors from "cors";
import { IncomingMessage } from 'http';
import { promisify } from 'util';
import { pipeline } from 'stream';

const app: Application = express();
const dashboardDirectory: string = "Dashboards";
const pipelineAsync = promisify(pipeline);
app.use(cors());

// Step 0: OPTIONAL Fetch dashboards from the dashboards folder
// this is a generic API to get the list of dashboards
app.get('/dashboards/names', (req, res) => {
	const directoryPath = `${dashboardDirectory}`;
  
	fs.readdir(directoryPath, (err, files) => {
	  if (err) {
		res.status(500).send({ error: 'Unable to scan directory' });
		return;
	  }
  
	  const fileNames = files.map((file) => {
		const { name } = path.parse(file);
		return { dashboardFileName: name, dashboardTitle: name };
	  });
  
	  res.send(fileNames);
	});
  });

// Step 1: OPTIONAL Create a user context provider
// https://help.revealbi.io/web/user-context/
const userContextProvider = (request: IncomingMessage): RVUserContext => {

	let userId = request.headers['x-header-customerid'] as string | undefined;
	const orderId = request.headers['x-header-orderid'] as string | undefined;
	const employeeId = request.headers['x-header-employeeid'] as string | undefined;
	const junk = request.headers['x-header-demo-demo'] as string | undefined;
  
	if (!userId) {
		userId = "ALFKI"; // Default user ID
	  }
  
	// Determine the role based on the userId
	// I use this in the dataSourceItemFilter function to 
	// limit what tables / views show up in the Data Source Dialog
	let role = "User";
	if (userId === "AROUT" || userId === "BLONP") {
	  role = "Admin";
	}
  
	// Create the properties map, note that in this sample, I am only 
	// using the userId & Role, I am not using OrderId or EmployeeId
	const props = new Map<string, any>();
	props.set("OrderId", orderId);
	props.set("EmployeeId", employeeId);
	props.set("Role", role);
  
	//console.log(`UserContextProvider: ${userId} ${orderId} ${employeeId}`);
	return new RVUserContext(userId || "", props);
  };

// Step 2: REQUIRED Create an authentication provider with username / password to your SQL Server database
// https://help.revealbi.io/web/authentication/?code=node-ts
const authenticationProvider = async (userContext: IRVUserContext | null, dataSource: RVDashboardDataSource) => {
	if (dataSource instanceof RVSqlServerDataSource) {
		return new RVUsernamePasswordDataSourceCredential("dev", "mugger(lunges0");
	}
	return null;
}

// Step 3: REQUIRED Add Host, Database to connect.  Schema is optional.
// https://help.revealbi.io/web/adding-data-sources/ms-sql-server/
const dataSourceProvider = async (userContext: IRVUserContext | null, dataSource: RVDashboardDataSource) => {
	if (dataSource instanceof RVSqlServerDataSource) {
		dataSource.host = "s0106linuxsql1.infragistics.local";
		dataSource.database = "devtest";
	}
	return dataSource;
}

// Step 4: REQUIRED Create a data source item provider to handle curated data source items, 
// custom queries, functions, etc.
// https://help.revealbi.io/web/adding-data-sources/ms-sql-server/
// https://help.revealbi.io/web/custom-queries/
const dataSourceItemProvider = async (userContext: IRVUserContext | null, dataSourceItem: RVDataSourceItem) => {
	if (dataSourceItem instanceof RVSqlServerDataSourceItem) {		
		
		//REQUIRED - update underlying data source - 
		// even if you don't have any custom queries, you MUST call this function
		dataSourceProvider(userContext, dataSourceItem.dataSource);
		
		// Update table based on id, table request from the client
		// everything in these 'if' statements is optional
		
		// Stored Procedure with a parameter
        if (dataSourceItem.id == "CustOrderHist")
			{
				dataSourceItem.procedure = "CustOrderHist";
				dataSourceItem.procedureParameters = {"@CustomerID": userContext?.userId};  
			}

		// Simple Stored Procedure
		if (dataSourceItem.id === "TenMostExpensiveProducts") {
			dataSourceItem.procedure = "Ten Most Expensive Products";
		}

		// Custom Query with a parameter + ad-hoc SQL
		if (dataSourceItem.id === "CustomerOrders") {
			dataSourceItem.customQuery = `SELECT c.*, o.orderid, o.orderdate, o.shipname, 
					o.shipaddress, o.shipcity, o.shipregion, 
					o.shippostalcode, o.shipcountry 
				FROM customers c
				JOIN orders o ON c.customerId = o.customerid 
				WHERE c.customerId = '${userContext?.userId}'
				`;
		  }

		// If the request is for the Customer or Orders table,
		// limit the data to the current user for RLS
		// This will is an incoming request from the DataSource dialog
		if (dataSourceItem.table === "Customers" || dataSourceItem.table === "Orders") {
			console.log(`UserContextProvider: ${userContext?.userId}`);
			dataSourceItem.customQuery = `SELECT * FROM [${dataSourceItem.table}] WHERE CustomerID = '${userContext?.userId}'`;
		}
		
	}
	return dataSourceItem;
}


// Step 5: OPTIONAL Create a data source item filter to restrict access to certain data source items
// https://github.com/RevealBi/Documentation/blob/master/docs/web/user-context.md
const dataSourceItemFilter = async (userContext: IRVUserContext | null, dataSourceItem: RVDataSourceItem): Promise<boolean> => {
	if (dataSourceItem instanceof RVSqlServerDataSourceItem) {
	  // Create an Include or Exclude list
	  const includedList = ["Customers", "Orders", "Order Details"];
  
	  // Check user role from the userContext - BLONP and AROUT are Admins
	  const role = userContext?.properties.get("Role") || "User";
  
	  if (role === "User") {
		// Allow only items in the included list for "User" role
		if (dataSourceItem.table && includedList.includes(dataSourceItem.table)) {
		  return true; // Allow access
		}
	  } else {
		// Allow everything for non-"User" roles
		return true;
	  }
	}
	return false; // Deny access
  };

// Step 6: OPTIONAL Create a DashboardProvider to handle custom dashboard loading / saving
// Read / write dashboards to the file system, or optionally a database
// also userContext can be used to save / load dashboards based on any property in the userContext
// https://help.revealbi.io/web/saving-dashboards/#example-implementing-save-with-irvdashboardprovider
const dashboardProvider = async (userContext:IRVUserContext | null, dashboardId: string) => {
	return fs.createReadStream(`${dashboardDirectory}/${dashboardId}.rdash`);
}

const dashboardStorageProvider = async (userContext: IRVUserContext | null, dashboardId: string, stream: fs.ReadStream) => {
	await pipelineAsync(stream, fs.createWriteStream(`${dashboardDirectory}/${dashboardId}.rdash`));
}

// Step 7: Set up the RevealOptions
// https://help.revealbi.io/web/getting-started-server-node-typescript/
const revealOptions: RevealOptions = {
	userContextProvider: userContextProvider,
	authenticationProvider: authenticationProvider,
	dataSourceProvider: dataSourceProvider,
	dataSourceItemProvider: dataSourceItemProvider,
	dataSourceItemFilter: dataSourceItemFilter,
	dashboardProvider: dashboardProvider,
	dashboardStorageProvider: dashboardStorageProvider,
}
app.use('/', reveal(revealOptions));

// Start the server
app.listen(5111, () => {
	console.log(`Reveal server accepting http requests`);
});
