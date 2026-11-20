/**
 * BizMind AI — OpenAPI 3.0.3 Specification (Swagger-Compatible)
 * Served at GET /api/v1/openapi.json
 */
export const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'BizMind AI — DemandIQ Retail Intelligence API',
    version: '2.7.0',
    description: 'Multi-tenant retail forecasting, 90-day backtest proof (WAPE/Bias), 10-store FedAvg federated learning, GDELT supply-shock signals, and 6-Agent LangGraph orchestration.',
  },
  servers: [{ url: 'https://bizmind-ai-orcin.vercel.app', description: 'Production Vercel Deployment' }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'HMAC-Token' },
    },
  },
  security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
  paths: {
    '/api/v1/public-ai/health': { get: { summary: 'Live server & service health check', responses: { '200': { description: 'OK' } } } },
    '/api/v1/ai/demandiq-benchmark': { get: { summary: 'Chronological 90-day WAPE/Bias benchmark (Naive Baseline vs Holt-Winters vs Weather-Aware) & Inventory Simulation', responses: { '200': { description: 'Benchmark metrics & explicit assumptions' } } } },
    '/api/v1/ai/federated-fedavg': { get: { summary: '10-Store FedAvg Federated Learning comparison (Solo Store WAPE vs Privacy-Preserving Global Model WAPE)', responses: { '200': { description: 'FedAvg round metrics' } } } },
    '/api/v1/signals/gdelt-shock': { get: { summary: 'GDELT Bangladesh supply-shock news keyword monitor (flood, strike, price surge)', responses: { '200': { description: 'External shock alert signal' } } } },
    '/api/v1/ai/multi-agent-trace': { post: { summary: 'Run 6-Agent StateGraph (Router -> Inventory/Sales/Finance/Supplier -> Manager) with live trace', responses: { '200': { description: 'Agent trace & Generative UI JSON' } } } },
    '/api/v1/reconciliation/po-invoice': { post: { summary: '3-Way PO vs Invoice OCR vs Received Stock reconciliation', responses: { '200': { description: 'Overcharge & hold-payment recommendation' } } } },
    '/api/v1/mcp': { post: { summary: 'Model Context Protocol (MCP) JSON-RPC 2.0 retail tools server', responses: { '200': { description: 'JSON-RPC 2.0 result' } } } },
  },
};
