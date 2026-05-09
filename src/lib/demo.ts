import type { AnalysisResponse, ChargeSheet, PrSnapshot } from './types'

export const demoPrSnapshot: PrSnapshot = {
  input: {
    owner: 'quack-dev',
    repo: 'demo-payments',
    number: 42,
    url: 'https://github.com/quack-dev/demo-payments/pull/42',
  },
  title: 'Add retry for timed out payment requests',
  body: 'Minor fix: retry payment client calls when the upstream API times out.',
  author: 'shaun',
  additions: 74,
  deletions: 12,
  changedFiles: 4,
  htmlUrl: 'https://github.com/quack-dev/demo-payments/pull/42',
  files: [
    {
      filename: 'src/api/paymentClient.ts',
      status: 'modified',
      additions: 31,
      deletions: 4,
      changes: 35,
      patch:
        '@@ retry payment requests on timeout\n+ if (error.code === "ETIMEDOUT") {\n+   return this.post("/payments", payload)\n+ }\n',
    },
    {
      filename: 'src/services/paymentService.ts',
      status: 'modified',
      additions: 16,
      deletions: 3,
      changes: 19,
      patch:
        '@@ charge customer\n+ const payment = await paymentClient.retryPayment(invoice)\n+ await markInvoicePaid(invoice.id)\n',
    },
    {
      filename: 'src/api/__tests__/paymentClient.test.ts',
      status: 'modified',
      additions: 18,
      deletions: 2,
      changes: 20,
      patch:
        '@@ tests\n+ it("retries one timeout", async () => {\n+   expect(result.status).toBe("paid")\n+ })\n',
    },
    {
      filename: '.env.example',
      status: 'modified',
      additions: 9,
      deletions: 3,
      changes: 12,
      patch: '+ PAYMENT_RETRY_TIMEOUT_MS=1500\n+ PAYMENT_RETRY_COUNT=1\n',
    },
  ],
  commits: [
    {
      sha: 'deadbeef',
      message: 'Retry payment timeouts',
      author: 'quack dev demo',
    },
  ],
}

export const demoChargeSheet: ChargeSheet = {
  case_title: 'Payment retry safety check',
  charge:
    'The pull request retries timed-out payment requests, but the diff does not show how duplicate charges are prevented.',
  summary:
    'A timeout can happen after the payment provider already accepted the charge. If the retry sends a second payment without a stable idempotency key or deduplication, the customer could be charged twice.',
  risk_level: 'critical',
  evidence: [
    'src/api/paymentClient.ts retries POST /payments after ETIMEDOUT.',
    'src/services/paymentService.ts calls retryPayment() before marking invoices paid.',
    'The pull request description calls this a minor fix even though payment behavior changes.',
    'The test covers a retry that succeeds, but not a first charge that succeeds while its response times out.',
  ],
  concepts_to_test: [
    {
      id: 'idempotency',
      concept: 'POST idempotency',
      severity: 'critical',
      question:
        'What prevents duplicate charges if the first payment request succeeds but the client times out before receiving the response?',
      expected_answer:
        'A stable idempotency key or server-side deduplication must tie both attempts to the same payment operation.',
      follow_up_if_weak:
        'Point to the code or test that shows both attempts are treated as the same payment.',
      status: 'unverified',
    },
    {
      id: 'retry-scope',
      concept: 'Retry safety',
      severity: 'high',
      question:
        'Which request methods need extra care before retrying, and why does this payment call need that protection?',
      expected_answer:
        'Non-idempotent methods like POST can create duplicate side effects unless the system enforces idempotency.',
      follow_up_if_weak:
        'What makes the second attempt reuse the same payment operation instead of creating a new one?',
      status: 'unverified',
    },
    {
      id: 'test-proof',
      concept: 'Test coverage',
      severity: 'high',
      question:
        'Which test covers the case where the first charge succeeds but the response times out?',
      expected_answer:
        'There should be a test simulating a successful first charge with a lost response, then verifying retry deduplication.',
      follow_up_if_weak:
        'What failure mode does the current retry test cover, and what payment-safety case is still missing?',
      status: 'unverified',
    },
  ],
}

export const demoAnalysis: AnalysisResponse = {
  pr: demoPrSnapshot,
  chargeSheet: demoChargeSheet,
  usedFallback: true,
}
