process.env.BACKEND_ROLE = process.env.BACKEND_ROLE || "admin";
process.env.PORT = process.env.PORT || "7860";

void import("./server");
