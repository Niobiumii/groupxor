export type PaymentRequestStatus = "pending" | "approved" | "rejected";

export type UserFlowState =
  | {
      step: "idle";
    }
  | {
      step: "awaiting_payment_proof";
      planId: number;
    };

export interface Plan {
  id: number;
  name: string;
  description: string;
  priceLabel: string;
  durationDays: number;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: number;
  label: string;
  type: "plans" | "support" | "custom_text" | "custom_url";
  value: string;
  sortOrder: number;
  isActive: boolean;
}

export interface PaymentRequest {
  id: string;
  userId: number;
  username: string | null;
  fullName: string;
  planId: number;
  planName: string;
  status: PaymentRequestStatus;
  proofType: "text" | "photo" | "document";
  proofValue: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface Settings {
  botName: string;
  welcomeMessage: string;
  plansTitle: string;
  paymentInstructions: string;
  supportText: string;
  successMessage: string;
  rejectionMessage: string;
  adminChatId: string;
  privateChannelId: string;
}
