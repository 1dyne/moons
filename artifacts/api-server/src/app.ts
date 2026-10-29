import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import workspaceRouter from "./moons/workspace-router";
import productRouter from "./moons/product-router";
import {clerkMiddleware} from "@clerk/express";
import {publishableKeyFromHost} from "@clerk/shared/keys";
import {CLERK_PROXY_PATH,clerkProxyMiddleware,getClerkProxyHost} from "./middlewares/clerkProxyMiddleware";
import {clerkEnabled,clerkProxyEnabled} from "./moons/lib/server/product-config";
import {serveWeb} from "./web";
import {mcpRouter} from "./moons/mcp-router";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({credentials:true,origin:true}));
// Clerk is optional: without both keys MOONS runs guest-only and accountId() is null.
if(clerkEnabled()){
 if(clerkProxyEnabled())app.use(CLERK_PROXY_PATH,clerkProxyMiddleware());
 app.use(clerkMiddleware((req)=>({
  publishableKey:publishableKeyFromHost(getClerkProxyHost(req)??"",process.env.CLERK_PUBLISHABLE_KEY),
 })));
}
app.get("/api/version",(_req,res)=>res.set("Cache-Control","no-store").json({commit:process.env.MOONS_BUILD_COMMIT??"unknown"}));
// OAuth (/.well-known, /authorize, /token, /register) and /mcp live at the root for AI connectors.
app.use(mcpRouter());
app.use("/api", workspaceRouter);
app.use("/api", productRouter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
serveWeb(app);

export default app;
