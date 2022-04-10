import BaseController, { ServiceContext } from "../../adapters/controllers/base/Base.controller";
import healthController from "../../adapters/controllers/health/Health.controller";
import routeWhiteListMiddleware from "../middleware/authorization/whiteList";
import AppSettings from "../../application/shared/settings/AppSettings";
import Encryption from "../../application/shared/security/encryption";
import authorizationMiddleware from "../middleware/authorization/jwt";
import { BooleanUtil } from "../../domain/shared/utils/BooleanUtil";
import {
  ServerApp,
  Application,
  bodyParser,
  urlencoded,
  RequestHandler,
  ErrorRequestHandler,
} from "./core/Modules";
import resources from "../../application/shared/locals/messages";
import localizationMiddleware from "../middleware/localization";
import ArrayUtil from "../../domain/shared/utils/ArrayUtil";
import { MessagingClient } from "./client/MessagingClient";
import words from "../../application/shared/locals/words";
import errorHandlerMiddleware from "../middleware/error";
import { resolve as resolvePath } from "path";
import { sync } from "fast-glob";
import config from "../config";
import helmet from "helmet";

export default class AppWrapper {
  private readonly controllersLoadedByConstructor = BooleanUtil.NOT;
  app: Application;
  messagingClient?: MessagingClient;

  constructor(controllers?: BaseController[]) {
    this.setup();
    this.app = ServerApp();
    this.app.set("trust proxy", BooleanUtil.YES);
    this.loadMiddleware();
    console.log(
      `Initializing controllers for ${AppSettings.ServiceContext.toUpperCase()} ServiceContext`,
    );
    if (ArrayUtil.any(controllers)) {
      this.loadControllersByConstructor(controllers as BaseController[]);
      this.controllersLoadedByConstructor = BooleanUtil.YES;
    }
    this.initializeMessagingClient();
  }

  private loadControllersByConstructor(controllers: BaseController[]): void {
    controllers
      .filter(
        (controller: BaseController) =>
          controller.serviceContext === AppSettings.ServiceContext ||
          controller.serviceContext === ServiceContext.NODE_TS_SKELETON,
      )
      .forEach((controller) => {
        console.log(`${controller?.constructor?.name} was initialized`);
        this.app.use(AppSettings.ServerRoot, controller.router);
      });
    this.app.use(healthController.resourceNotFound);
    this.loadErrorHandler();
  }

  private async loadControllersDynamically(): Promise<void> {
    if (this.controllersLoadedByConstructor) return Promise.resolve();

    const controllerPaths = config.Server.ServiceContext.LoadWithContext
      ? config.Controllers.ContextPaths.map((serviceContext) => {
          return sync(serviceContext, {
            onlyFiles: BooleanUtil.YES,
            ignore: config.Controllers.Ignore,
          });
        }).flat()
      : sync(config.Controllers.DefaultPath, {
          onlyFiles: BooleanUtil.YES,
          ignore: config.Controllers.Ignore,
        });
    for (const filePath of controllerPaths) {
      const controllerPath = resolvePath(filePath);
      const { default: controller } = await import(controllerPath);
      console.log(`${controller?.constructor?.name} was loaded`);
      this.app.use(AppSettings.ServerRoot, (controller as BaseController)?.router);
    }
    this.app.use(healthController.resourceNotFound);
    this.loadErrorHandler();

    return Promise.resolve();
  }

  private loadMiddleware(): void {
    this.app.use(helmet());
    this.app.use(bodyParser());
    this.app.use(urlencoded({ extended: BooleanUtil.YES }));
    this.app.use(localizationMiddleware.handle as RequestHandler);
    this.app.use(routeWhiteListMiddleware.handle as RequestHandler);
    this.app.use(authorizationMiddleware.handle.bind(this) as RequestHandler);
  }

  private loadErrorHandler(): void {
    this.app.use(errorHandlerMiddleware.handle as ErrorRequestHandler);
  }

  private setup(): void {
    AppSettings.init(config);
    resources.setDefaultLanguage(AppSettings.DefaultLang);
    words.setDefaultLanguage(AppSettings.DefaultLang);
    Encryption.init(
      AppSettings.EncryptionKey,
      AppSettings.EncryptionIterations,
      AppSettings.EncryptionKeySize,
    );
  }

  private initializeMessagingClient(): void {
    this.messagingClient = new MessagingClient();
  }

  initializeServices(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loadControllersDynamically()
        .then(() => {
          this.messagingClient?.initialize();
          resolve();
        })
        .catch((error) => {
          this.messagingClient?.close();
          reject(error);
        });
    });
  }
}
