import { net } from "electron";
import {
  buildHelpAppConfigUrl,
  buildZCodeSourceHeadersFromContext,
  createHelpAppConfigReader,
  ZCODE_ENV,
} from "@zcode/shared";

export function createDesktopHelpConfigReader(options: {
  resolveEndpointOrigin: () => Promise<string>;
  appVersion: string;
}) {
  const read = createHelpAppConfigReader({
    // 契约只承诺 string | Request；这里只可能收到 string（调用点已 String() 归一）。
    fetchImpl: (input, init) => net.fetch(String(input), init),
  });
  return async () => {
    const endpointOrigin = await options.resolveEndpointOrigin();
    return read(
      String(
        buildHelpAppConfigUrl(
          endpointOrigin,
          options.appVersion,
          `${process.platform}-${process.arch}`,
        ),
      ),
      buildZCodeSourceHeadersFromContext({
        endpointOrigin,
        appVersion: options.appVersion,
        // DWeis Next 不做遥测：不再发送设备指纹（device_mid）到 help 配置接口。
        deviceMid: "",
        platform: process.platform,
        arch: process.arch,
        releaseChannel: ZCODE_ENV,
        sourceTitle: "electron",
      }),
    );
  };
}
