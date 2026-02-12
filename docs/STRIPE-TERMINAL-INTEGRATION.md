# Stripe Terminal S700 Integration Plan

**Status:** Research Complete  
**Priority:** HIGH  
**Target:** Three Squares first, then Hafaloha V2  
**Hardware Available:** Leon has S700 for testing ✅

---

## Overview

The Stripe Reader S700 is a "smart reader" that connects directly to web applications via the Stripe Terminal JavaScript SDK. This eliminates the need for a separate payment app (the workaround used in Hafaloha Legacy).

### Why S700?
| Feature | M2 Reader (Current) | S700 Reader (New) |
|---------|---------------------|-------------------|
| Price | ~$59 | ~$349 |
| Web SDK Support | ❌ Mobile only | ✅ JavaScript SDK |
| Built-in Display | ❌ | ✅ Touch screen |
| Customer-facing UI | ❌ | ✅ Shows amount, prompts |
| PIN Entry | ❌ | ✅ Built-in |
| Contactless | ✅ | ✅ |
| Chip + Swipe | ✅ | ✅ |

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────┐
│  Three Squares Web  │────▶│   Rails API         │────▶│   Stripe    │
│  (React Frontend)   │     │   (Backend)         │     │   API       │
│                     │     │                     │     │             │
│  - POS UI           │     │  - Connection Token │     │             │
│  - Terminal SDK     │     │  - PaymentIntent    │     │             │
│  - Reader Controls  │     │  - Capture/Refund   │     │             │
└─────────────────────┘     └─────────────────────┘     └─────────────┘
         │
         │ Local Network (WiFi)
         ▼
┌─────────────────────┐
│  Stripe Reader S700 │
│  (Smart Reader)     │
│                     │
│  - Card tap/insert  │
│  - PIN entry        │
│  - Customer display │
└─────────────────────┘
```

---

## Implementation Steps

### Phase 1: Backend Setup

#### 1.1 Add Connection Token Endpoint

```ruby
# api/app/controllers/api/v1/stripe_terminal_controller.rb

module Api
  module V1
    class StripeTerminalController < ApplicationController
      include Authenticatable
      before_action :authenticate_request
      before_action :require_staff_or_admin!

      # POST /api/v1/stripe_terminal/connection_token
      # Returns a connection token for the Terminal SDK
      def connection_token
        token = Stripe::Terminal::ConnectionToken.create
        render json: { secret: token.secret }
      rescue Stripe::StripeError => e
        render json: { error: e.message }, status: :bad_request
      end
    end
  end
end
```

#### 1.2 Add Route

```ruby
# config/routes.rb
namespace :api do
  namespace :v1 do
    namespace :stripe_terminal do
      post :connection_token
    end
  end
end
```

#### 1.3 Update PaymentIntent Creation for Terminal

```ruby
# api/app/services/payment_service.rb

def create_terminal_payment_intent(order)
  Stripe::PaymentIntent.create(
    amount: order.total_cents,
    currency: 'usd',
    payment_method_types: ['card_present'],
    capture_method: 'manual', # Manual capture for reconciliation
    metadata: {
      order_id: order.id,
      order_number: order.order_number
    }
  )
end
```

### Phase 2: Frontend Setup

#### 2.1 Install Terminal SDK

```bash
npm install @stripe/terminal-js
```

#### 2.2 Create Terminal Service

```typescript
// web/src/services/stripeTerminal.ts

import { loadStripeTerminal, Terminal } from '@stripe/terminal-js';

let terminal: Terminal | null = null;

export async function initializeTerminal(): Promise<Terminal> {
  if (terminal) return terminal;

  const StripeTerminal = await loadStripeTerminal();
  
  terminal = StripeTerminal.create({
    onFetchConnectionToken: fetchConnectionToken,
    onUnexpectedReaderDisconnect: handleDisconnect,
  });

  return terminal;
}

async function fetchConnectionToken(): Promise<string> {
  const response = await fetch('/api/v1/stripe_terminal/connection_token', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json();
  return data.secret;
}

function handleDisconnect(): void {
  console.log('Reader disconnected unexpectedly');
  // Show UI notification to user
}

export async function discoverReaders(): Promise<Reader[]> {
  const t = await initializeTerminal();
  const result = await t.discoverReaders({ simulated: false });
  
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  return result.discoveredReaders;
}

export async function connectReader(reader: Reader): Promise<void> {
  const t = await initializeTerminal();
  const result = await t.connectReader(reader);
  
  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function collectPayment(clientSecret: string): Promise<PaymentIntent> {
  const t = await initializeTerminal();
  
  // Collect payment method (card tap/insert)
  const collectResult = await t.collectPaymentMethod(clientSecret, {
    config_override: {
      enable_customer_cancellation: true,
    },
  });
  
  if (collectResult.error) {
    throw new Error(collectResult.error.message);
  }
  
  // Process the payment (authorize)
  const processResult = await t.processPayment(collectResult.paymentIntent);
  
  if (processResult.error) {
    throw new Error(processResult.error.message);
  }
  
  return processResult.paymentIntent;
}

export async function cancelPayment(): Promise<void> {
  const t = await initializeTerminal();
  await t.cancelCollectPaymentMethod();
}
```

#### 2.3 Create POS Payment Component

```tsx
// web/src/components/pos/TerminalPayment.tsx

import { useState, useEffect } from 'react';
import { discoverReaders, connectReader, collectPayment } from '../../services/stripeTerminal';

interface TerminalPaymentProps {
  orderTotal: number;
  orderId: number;
  onPaymentSuccess: (paymentIntent: any) => void;
  onPaymentError: (error: Error) => void;
}

export function TerminalPayment({ 
  orderTotal, 
  orderId, 
  onPaymentSuccess, 
  onPaymentError 
}: TerminalPaymentProps) {
  const [status, setStatus] = useState<'idle' | 'discovering' | 'connecting' | 'collecting' | 'processing'>('idle');
  const [readers, setReaders] = useState<any[]>([]);
  const [connectedReader, setConnectedReader] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Discover readers on mount
  useEffect(() => {
    handleDiscoverReaders();
  }, []);

  async function handleDiscoverReaders() {
    setStatus('discovering');
    setError(null);
    
    try {
      const discovered = await discoverReaders();
      setReaders(discovered);
      setStatus('idle');
      
      // Auto-connect if only one reader
      if (discovered.length === 1) {
        await handleConnectReader(discovered[0]);
      }
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  async function handleConnectReader(reader: any) {
    setStatus('connecting');
    setError(null);
    
    try {
      await connectReader(reader);
      setConnectedReader(reader);
      setStatus('idle');
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  async function handleCollectPayment() {
    setStatus('collecting');
    setError(null);
    
    try {
      // 1. Create PaymentIntent on server
      const response = await fetch('/api/v1/orders/${orderId}/terminal_payment', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
      });
      const { client_secret } = await response.json();
      
      // 2. Collect payment via terminal
      setStatus('processing');
      const paymentIntent = await collectPayment(client_secret);
      
      // 3. Notify server to capture
      await fetch(`/api/v1/orders/${orderId}/capture_terminal_payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payment_intent_id: paymentIntent.id }),
      });
      
      onPaymentSuccess(paymentIntent);
      setStatus('idle');
    } catch (err) {
      setError(err.message);
      onPaymentError(err);
      setStatus('idle');
    }
  }

  return (
    <div className="terminal-payment">
      {/* Reader status */}
      {connectedReader ? (
        <div className="reader-connected">
          ✅ Connected: {connectedReader.label || connectedReader.serial_number}
        </div>
      ) : (
        <div className="reader-disconnected">
          ⚠️ No reader connected
          <button onClick={handleDiscoverReaders}>Discover Readers</button>
        </div>
      )}
      
      {/* Reader selection */}
      {readers.length > 1 && !connectedReader && (
        <div className="reader-list">
          {readers.map((reader) => (
            <button key={reader.id} onClick={() => handleConnectReader(reader)}>
              {reader.label || reader.serial_number}
            </button>
          ))}
        </div>
      )}
      
      {/* Payment button */}
      {connectedReader && (
        <button 
          onClick={handleCollectPayment}
          disabled={status !== 'idle'}
          className="collect-payment-btn"
        >
          {status === 'collecting' && 'Waiting for card...'}
          {status === 'processing' && 'Processing...'}
          {status === 'idle' && `Collect $${(orderTotal / 100).toFixed(2)}`}
        </button>
      )}
      
      {/* Error display */}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

### Phase 3: Reader Setup

#### 3.1 Register Reader in Stripe Dashboard

1. Go to Stripe Dashboard → Terminal → Readers
2. Add reader using registration code on S700 screen
3. Assign to a location (create one for Three Squares)

#### 3.2 Network Requirements

- Reader and web app must be on **same local network**
- Network must allow device-to-device communication
- Port 443 (HTTPS) must be open to Stripe's servers

#### 3.3 Chrome 142+ Permission

Chrome 142+ requires explicit permission for local network access:
1. User will see a permission prompt when connecting to reader
2. Must click "Allow" to proceed
3. This is a one-time prompt per origin

---

## Testing Plan

### Local Development Testing

1. **Simulated Reader Mode**
   ```typescript
   const result = await terminal.discoverReaders({ simulated: true });
   ```
   - Use simulated reader for development without physical hardware
   - Test card: `4242424242424242` (success)
   - Test card: `4000000000000002` (decline)

2. **Physical Reader Testing (Leon's S700)**
   - Connect S700 to office WiFi
   - Register in Stripe Dashboard (test mode)
   - Run through full payment flow

### Test Matrix

| Test Case | Expected Result |
|-----------|-----------------|
| Tap card (success) | Payment authorized |
| Tap card (decline) | Error shown, can retry |
| Insert chip card | Payment authorized |
| Cancel mid-transaction | Transaction cancelled |
| Reader disconnects | Error shown, can reconnect |
| Network timeout | Error shown, can retry |

---

## Rollout Plan

### Week 1: Development
- [ ] Backend: Connection token endpoint
- [ ] Backend: Terminal PaymentIntent creation
- [ ] Frontend: Terminal service
- [ ] Frontend: POS payment component

### Week 2: Testing
- [ ] Simulated reader testing
- [ ] Physical S700 testing (Leon's device)
- [ ] Edge case testing

### Week 3: Integration
- [ ] Integrate into Three Squares POS flow
- [ ] Staff training documentation
- [ ] Deploy to staging

### Week 4: Production
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] Document learnings for Hafaloha V2

---

## Cost Analysis

| Item | Cost | Notes |
|------|------|-------|
| S700 Reader | $349 | One-time |
| Transaction Fee | 2.7% + 5¢ | Per transaction |
| Monthly Fee | $0 | No monthly fee for Terminal |

### ROI Justification
- Eliminates dual-app workflow (saves ~30 sec per transaction)
- Reduces errors from manual entry
- Better customer experience
- Unified reporting in Stripe Dashboard

---

## Questions to Resolve

1. **Multiple readers per location?** Do they need multiple S700s for busy times?
2. **Offline mode?** S700 supports offline transactions—do they need this for pop-ups with poor connectivity?
3. **Tipping?** Should we enable tip prompts on the reader?
4. **Receipt printing?** S700 doesn't have a printer—need separate receipt solution?

---

## References

- [Stripe Terminal Docs](https://docs.stripe.com/terminal)
- [JavaScript SDK Reference](https://docs.stripe.com/terminal/references/api/js-sdk)
- [S700 Reader Guide](https://docs.stripe.com/terminal/readers/stripe-reader-s700)
- [Example Application](https://stripe.com/docs/terminal/example-applications)
