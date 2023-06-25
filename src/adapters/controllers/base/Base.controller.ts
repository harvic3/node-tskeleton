import { ILogProvider } from "../../../application/shared/log/providerContracts/ILogProvider";
import { IUseCaseTraceRepository } from "../../repositories/trace/IUseCaseTrace.repository";
import { UseCaseTraceRepository } from "../../repositories/trace/UseCaseTrace.repository";
import applicationStatus from "../../../application/shared/status/applicationStatus";
import { UseCaseTrace } from "../../../application/shared/log/UseCaseTrace";
import { IResult } from "../../../application/shared/useCase/BaseUseCase";
import { HttpStatusResolver } from "./httpResponse/HttpStatusResolver";
import { HttpContentTypeEnum } from "./context/HttpContentType.enum";
import { ErrorLog } from "../../../application/shared/log/ErrorLog";
import { IBaseResult } from "result-tsk/lib/Result.interface";
import { ServiceContext } from "../../shared/ServiceContext";
import { HttpMethodEnum } from "./context/HttpMethod.enum";
import { HttpHeaderEnum } from "./context/HttpHeader.enum";
import statusMapping from "./httpResponse/StatusMapping";
import { LogProvider } from "../../providers/container";
import { INextFunction } from "./context/INextFunction";
import { IServiceContainer } from "../../shared/kernel";
import httpStatus from "./httpResponse/httpStatus";
import { IResponse } from "./context/IResponse";
import { IRequest } from "./context/IRequest";
import { IRouter } from "./context/IRouter";

type EntryPointHandler = (req: IRequest, res: IResponse, next: INextFunction) => Promise<void>;
type HeaderType = { [key in HttpHeaderEnum]?: HttpContentTypeEnum | string };

export {
  EntryPointHandler,
  IRequest,
  IResponse,
  INextFunction,
  IRouter,
  ServiceContext,
  HttpMethodEnum,
  HttpContentTypeEnum,
  HttpHeaderEnum,
  applicationStatus,
  httpStatus,
};

export default abstract class BaseController {
  router?: IRouter;
  serviceContext: ServiceContext;
  #logProvider: ILogProvider;
  #useCaseTraceRepository: IUseCaseTraceRepository;

  constructor(
    readonly CONTEXT: string,
    readonly servicesContainer: IServiceContainer,
    serviceContext: ServiceContext = ServiceContext.NODE_TS_SKELETON,
  ) {
    this.serviceContext = serviceContext;
    this.#useCaseTraceRepository = this.servicesContainer.get<IUseCaseTraceRepository>(
      this.CONTEXT,
      UseCaseTraceRepository.name,
    );
    this.#logProvider = this.servicesContainer.get<LogProvider>(this.CONTEXT, LogProvider.name);
  }

  setRouter(router: IRouter): void {
    this.router = router;
  }

  private setTransactionId(res: IResponse): void {
    res.setHeader(HttpHeaderEnum.TRANSACTION_ID, res.trace.transactionId);
  }

  private setHeaders(res: IResponse, headersToSet?: HeaderType): void {
    if (headersToSet) {
      Object.entries(headersToSet).forEach(([key, value]) => res.setHeader(key, value));
    }
  }

  private async getResult(
    res: IResponse,
    result: IResult,
    headersToSet?: HeaderType,
  ): Promise<void> {
    this.setTransactionId(res);
    this.setHeaders(res, headersToSet);
    res.status(HttpStatusResolver.getCode(result.statusCode.toString())).json(result);
  }

  private async getResultDto(
    res: IResponse,
    result: IResult,
    headersToSet?: HeaderType,
  ): Promise<void> {
    this.setTransactionId(res);
    this.setHeaders(res, headersToSet);
    res.status(HttpStatusResolver.getCode(result.statusCode.toString())).json(result.toResultDto());
  }

  private async getResultData(
    res: IResponse,
    result: IResult,
    headersToSet?: HeaderType,
  ): Promise<void> {
    this.setTransactionId(res);
    this.setHeaders(res, headersToSet);
    res
      .status(HttpStatusResolver.getCode(result.statusCode.toString()))
      .json(result.message ? result.toResultDto() : result.toResultDto().data);
  }

  private async manageUseCaseTrace(trace: UseCaseTrace): Promise<void> {
    if (trace?.context) {
      trace.finish(new Date());
      return Promise.resolve(this.#useCaseTraceRepository.register(trace)).catch((error) => {
        this.#logProvider.logError(
          new ErrorLog({
            context: this.CONTEXT,
            name: "ManageUseCaseTraceError",
            message: error.message,
            stack: error.stack,
          }),
        );
      });
    }
  }

  private setProducesCode(applicationStatus: string, httpStatus: number): void {
    if (!statusMapping[applicationStatus]) {
      statusMapping[applicationStatus] = httpStatus;
    }
  }

  addRoute(route: {
    method: HttpMethodEnum;
    path: string;
    handlers: EntryPointHandler[];
    contentType: HttpContentTypeEnum;
    produces: {
      applicationStatus: string;
      httpStatus: number;
      response?: IBaseResult;
      request?: any;
    }[];
  }): void {
    const { method, path, handlers, produces } = route;
    produces.forEach(({ applicationStatus, httpStatus }) =>
      this.setProducesCode(applicationStatus, httpStatus),
    );
    (this.router as IRouter)[method](path, ...handlers);
  }

  async handleResult(
    res: IResponse,
    next: INextFunction,
    useCasePromise: Promise<IResult>,
    headersToSet?: HeaderType,
  ): Promise<void> {
    try {
      return await this.getResult(res, await useCasePromise, headersToSet);
    } catch (error) {
      return next(error);
    } finally {
      this.manageUseCaseTrace(res.trace);
    }
  }

  async handleResultDto(
    res: IResponse,
    next: INextFunction,
    useCasePromise: Promise<IResult>,
    headersToSet?: HeaderType,
  ): Promise<void> {
    try {
      return await this.getResultDto(res, await useCasePromise, headersToSet);
    } catch (error) {
      return next(error);
    } finally {
      this.manageUseCaseTrace(res.trace);
    }
  }

  async handleResultData(
    res: IResponse,
    next: INextFunction,
    useCasePromise: Promise<IResult>,
    headersToSet?: HeaderType,
  ): Promise<void> {
    try {
      return await this.getResultData(res, await useCasePromise, headersToSet);
    } catch (error) {
      return next(error);
    } finally {
      this.manageUseCaseTrace(res.trace);
    }
  }

  abstract initializeRoutes(router: IRouter): void;
}
