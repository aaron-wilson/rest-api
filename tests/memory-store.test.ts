import { createMemoryStore } from "../src/store/memory";
import { tripStoreContract } from "./store-contract";

tripStoreContract("memory trip store", createMemoryStore);
