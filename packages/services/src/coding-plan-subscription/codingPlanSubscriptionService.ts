import type {
  ForceUpdateConfig,
  CodingPlanAgreementResponse,
  CodingPlanBatchPreviewResponse,
  CodingPlanPaymentCheckResponse,
  CodingPlanPendingOrderCheckResponse,
  CodingPlanPaypalSetupTokenResponse,
  CodingPlanPaypalSubscribeResponse,
  CodingPlanPaypalSupportResponse,
  CodingPlanProductInfo,
  CodingPlanProductInfoRequest,
  CodingPlanStaticProductsConfig,
  CodingPlanStaticTeamProductsConfig,
  CodingPlanPreviewRequest,
  CodingPlanPreviewResponse,
  CodingPlanStripeBindResponse,
  CodingPlanStripeCard,
  CodingPlanStripePayResponse,
  EnterpriseCodingPlanCancelOrderRequest,
  EnterpriseCodingPlanCancelOrderResponse,
  EnterpriseCodingPlanCreateOrderResponse,
  EnterpriseCodingPlanBalanceResponse,
  EnterpriseCodingPlanContinuePayRequest,
  EnterpriseCodingPlanOrderCalculateResponse,
  EnterpriseCodingPlanPendingOrder,
  EnterpriseCodingPlanOrderStatusRequest,
  EnterpriseCodingPlanOrderStatusResponse,
  EnterpriseCodingPlanPricingResponse,
  StartPlanPreviewConfig,
  ZCodeModelContextBudgetStrategy,
  DynamicWorkflowClientConfig,
} from "@zcode/shared";
import {
  DEFAULT_ZCODE_MODEL_CONTEXT_BUDGET_STRATEGY,
  DEFAULT_DYNAMIC_WORKFLOW_MODE,
  createDynamicWorkflowClientConfig,
  normalizeDynamicWorkflowMode,
  resolveDynamicWorkflowClientConfig,
  ZCODE_DYNAMIC_WORKFLOW_MODE_ENV,
} from "@zcode/shared";
import type { ModelSelectionView } from "@zcode/provider";
import type { ICodingPlanSubscriptionService, OffPeakClientConfig } from "./codingPlanSubscription.js";

interface CodingPlanSubscriptionServiceDependencies {
  resolveOffPeakModelSelectionView?: () => Promise<ModelSelectionView>;
}

/**
 * DWeis Next：CodingPlan 网络层整体摘除后的本地空实现。
 *
 * DWeis Next 是无账号、无云绑定的自托管产品（见 docs/dweis-next-plan.md）：
 * 套餐目录、购买支付、企业订单全部依赖 Z.ai / BigModel 平台账号，在无账号产品里
 * 既是死路径也是潜在的出网通道，因此所有账号类方法恒返回「账号未连接」语义的
 * 本地空值，绝不发起网络请求。
 *
 * 仅保留与账号无关的平台能力，且全部走本地判定：
 *   - 闲时任务（Off-Peak）：仅 ZCODE_OFFPEAK_MOCK=1（E2E/演示）时可用；
 *   - 动态工作流：仅 ZCODE_DYNAMIC_WORKFLOW_MODE 环境变量本地覆盖生效；
 *   - 模型上下文预算：固定 preflight-v1（shared 常量）；
 *   - 强更配置：恒 null（自托管不存在平台强更）。
 *
 * ICodingPlanSubscriptionService 是跨包公开契约（client/remoteServiceAccess、
 * desktop host 装配、ui store 都依赖），按遥测阶段同款「关出口 + 保留契约」
 * 策略保持方法签名不变，只替换实现。
 */
export function createCodingPlanSubscriptionService(
  dependencies: CodingPlanSubscriptionServiceDependencies,
): ICodingPlanSubscriptionService {
  return {
    // ---- 套餐目录 / 购买 / 支付：全部本地空值 ----
    batchPreview: async (): Promise<CodingPlanBatchPreviewResponse> => ({
      productList: [],
      isSubscribed: false,
      isAuthenticated: null,
    }),
    getStaticProducts: async (): Promise<CodingPlanStaticProductsConfig> => ({}),
    getStaticTeamProducts: async (): Promise<CodingPlanStaticTeamProductsConfig> => ({}),
    getStartPlanPreview: async (): Promise<StartPlanPreviewConfig | null> => null,
    productInfo: async (request: CodingPlanProductInfoRequest): Promise<CodingPlanProductInfo> => ({
      productId: request.productId,
    }),
    preview: async (request: CodingPlanPreviewRequest): Promise<CodingPlanPreviewResponse> => ({
      productId: request.productId,
      bizId: "",
    }),
    createSign: async (): Promise<CodingPlanAgreementResponse> => ({ sign: "" }),
    updateSign: async (): Promise<CodingPlanAgreementResponse> => ({ sign: "" }),
    checkPayment: async (): Promise<CodingPlanPaymentCheckResponse> => ({ status: "" }),
    checkPendingOrders: async (): Promise<CodingPlanPendingOrderCheckResponse> => ({
      hasPendingOrders: false,
    }),
    queryStripeCards: async (): Promise<CodingPlanStripeCard[]> => [],
    bindStripeCard: async (): Promise<CodingPlanStripeBindResponse> => ({ paymentMethodId: "" }),
    unbindStripeCard: async (): Promise<string> => "",
    payStripe: async (): Promise<CodingPlanStripePayResponse> => ({}),
    checkPaypalSupport: async (): Promise<CodingPlanPaypalSupportResponse> => ({
      isSupport: false,
    }),
    createPaypalSetupToken: async (): Promise<CodingPlanPaypalSetupTokenResponse> => ({}),
    subscribePaypal: async (): Promise<CodingPlanPaypalSubscribeResponse> => ({}),

    // ---- 企业订单：全部本地空值 ----
    getEnterprisePricing: async (): Promise<EnterpriseCodingPlanPricingResponse> => ({
      productList: [],
    }),
    getEnterpriseBalance: async (): Promise<EnterpriseCodingPlanBalanceResponse> => ({
      giveBalance: 0,
      cashBalance: 0,
      totalBalance: 0,
    }),
    calculateEnterpriseOrder: async (): Promise<EnterpriseCodingPlanOrderCalculateResponse> => ({
      totalOriginalAmount: 0,
      totalPayAmount: 0,
      thirdPayAmount: 0,
    }),
    createEnterpriseOrder: async (): Promise<EnterpriseCodingPlanCreateOrderResponse> => ({
      orderNo: "",
      totalOriginalAmount: 0,
      totalPayAmount: 0,
      thirdPayAmount: 0,
    }),
    getEnterprisePendingOrders: async (): Promise<EnterpriseCodingPlanPendingOrder[]> => [],
    cancelEnterpriseOrder: async (
      request: EnterpriseCodingPlanCancelOrderRequest,
    ): Promise<EnterpriseCodingPlanCancelOrderResponse> => ({
      orderNo: request.orderNo,
      status: "CANCELLED",
    }),
    continueEnterpriseOrderPayment: async (
      request: EnterpriseCodingPlanContinuePayRequest,
    ): Promise<EnterpriseCodingPlanCreateOrderResponse> => ({
      orderNo: request.orderNo,
      totalOriginalAmount: 0,
      totalPayAmount: 0,
      thirdPayAmount: 0,
    }),
    checkEnterpriseOrderStatus: async (
      request: EnterpriseCodingPlanOrderStatusRequest,
    ): Promise<EnterpriseCodingPlanOrderStatusResponse> => ({
      orderNo: request.orderNo,
      paymentStatus: "CLOSED",
    }),

    // ---- 平台级配置：保留能力，改为纯本地判定 ----
    async getOffPeakClientConfig(): Promise<OffPeakClientConfig> {
      const modelSelectionView =
        (await dependencies.resolveOffPeakModelSelectionView?.()) ??
        EMPTY_OFF_PEAK_MODEL_SELECTION_VIEW;
      return resolveLocalOffPeakClientConfig(process.env, modelSelectionView);
    },
    async getDynamicWorkflowClientConfig(): Promise<DynamicWorkflowClientConfig> {
      // 无远端灰度来源后只剩本地覆盖通道（ZCODE_DYNAMIC_WORKFLOW_MODE）；
      // 未覆盖时走 default（disabled），fail-closed 语义与原实现一致。
      const localMode = normalizeDynamicWorkflowMode(process.env[ZCODE_DYNAMIC_WORKFLOW_MODE_ENV]);
      if (localMode) {
        return resolveDynamicWorkflowClientConfig({ remote: undefined, env: process.env });
      }
      return createDynamicWorkflowClientConfig(DEFAULT_DYNAMIC_WORKFLOW_MODE, "default");
    },
    async getModelContextBudgetStrategy(): Promise<ZCodeModelContextBudgetStrategy> {
      // 预算统一为 preflight-v1；保留兼容方法，不读取远端配置。
      return DEFAULT_ZCODE_MODEL_CONTEXT_BUDGET_STRATEGY;
    },
    async getForceUpdateConfig(): Promise<ForceUpdateConfig | null> {
      // 自托管无平台强更通道。
      return null;
    },
  } satisfies ICodingPlanSubscriptionService;
}

/**
 * 闲时任务灰度本地判据（原 bigmodel provider 内同名纯函数平移）：
 * 远端曝光开关来源（client/configs）已随网络层摘除，本地只剩 mock 演示通道；
 * 非 mock 环境 enabled 恒 false，模型成员与事实仍来自 Model Selection View。
 */
function resolveLocalOffPeakClientConfig(
  env: NodeJS.ProcessEnv,
  modelSelectionView: ModelSelectionView,
): OffPeakClientConfig {
  const hasModels = modelSelectionView.providers.some((provider) => provider.models.length > 0);
  if (env["ZCODE_OFFPEAK_MOCK"] === "1") {
    return {
      enabled: hasModels,
      modelSelectionView,
      // ZCODE_OFFPEAK_MOCK_NO_PLAN=1 演示「非 coding plan 锁定」态；缺省视为已订阅。
      codingPlanActive: env["ZCODE_OFFPEAK_MOCK_NO_PLAN"] !== "1",
    };
  }
  return {
    enabled: false,
    modelSelectionView,
  };
}

const EMPTY_OFF_PEAK_MODEL_SELECTION_VIEW: ModelSelectionView = Object.freeze({
  revision: 0,
  providers: Object.freeze([]),
});
