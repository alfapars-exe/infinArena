process.env.BACKEND_ROLE = process.env.BACKEND_ROLE || "player";
process.env.PORT = process.env.PORT || "7861";

void import("./server");
