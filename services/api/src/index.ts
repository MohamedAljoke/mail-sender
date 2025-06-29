import { env } from "./env.validator";
import { ExpressHttpService } from "./server";

const httpService = new ExpressHttpService();
const app = httpService.getApp();

httpService.listen(env.PORT ?? 3000);
