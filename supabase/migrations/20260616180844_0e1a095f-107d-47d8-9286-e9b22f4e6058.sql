
ALTER TYPE public.financial_movement_type ADD VALUE IF NOT EXISTS 'commission_paid';
ALTER TYPE public.order_event_type ADD VALUE IF NOT EXISTS 'dispute_resolved';
ALTER TYPE public.order_decision_type ADD VALUE IF NOT EXISTS 'mark_dispute_resolved';
