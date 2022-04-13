import { IUserDto } from "../../../application/modules/users/dtos/User.dto";
import container, { RegisterUserUseCase } from "./container";
import BaseController, {
  IRequest,
  IResponse,
  INextFunction,
  EntryPointHandler,
  IRouterType,
  ServiceContext,
} from "../base/Base.controller";

class UsersController extends BaseController {
  constructor() {
    super(ServiceContext.USERS);
  }

  singUp: EntryPointHandler = async (
    req: IRequest,
    res: IResponse,
    next: INextFunction,
  ): Promise<void> => {
    const userDto = req.body as IUserDto;

    return this.handleResult(
      res,
      next,
      container.get<RegisterUserUseCase>(RegisterUserUseCase.name),
      userDto,
    );
  };

  initializeRoutes(router: IRouterType): void {
    this.router = router();
    this.router.post("/v1/users/sign-up", this.singUp);
  }
}

export default new UsersController();
