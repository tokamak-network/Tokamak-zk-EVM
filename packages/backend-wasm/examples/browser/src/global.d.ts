declare global {
  interface Window {
    __tokamakExampleResult?: {
      readonly status: "pending" | "ok" | "error";
      readonly valid?: boolean;
      readonly error?: string;
    };
  }
}

export {};
