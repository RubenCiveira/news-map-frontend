import { Client } from 'appwrite';
import { environment } from '../../../environments/environment';

console.log("USING " + environment.appwrite.endpoint );
console.log("WITH " + environment.appwrite.projectId );


export const appwriteClient = new Client()
  .setEndpoint(environment.appwrite.endpoint)
  .setProject(environment.appwrite.projectId);
