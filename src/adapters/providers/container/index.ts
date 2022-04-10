import { HealthProvider } from "../health/Health.provider";
import logger from "../../../infrastructure/logger/Logger";
import { WorkerProvider } from "../worker/Worker.provider";
import { AuthProvider } from "../auth/Auth.provider";
import { LogProvider } from "../log/Log.provider";

const logProvider = new LogProvider(logger);

const authProvider = new AuthProvider(logProvider);

const healthProvider = new HealthProvider();

const workerProvider = new WorkerProvider(logProvider);

export { logProvider, healthProvider, authProvider, workerProvider };
