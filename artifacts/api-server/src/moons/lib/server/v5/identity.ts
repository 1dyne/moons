import {getAuth} from '@clerk/express';
import type {Request} from 'express';
export function accountId(req:Request) {
  // The middleware owns auth. Never accept a browser-supplied user/owner ID.
  if(!('auth' in req))return null;
  return getAuth(req).userId;
}
