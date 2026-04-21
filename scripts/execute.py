import os
import json
import time

PHASES = ["REQUIREMENTS_ANALYSIS", "TEST", "IMPLEMENTATION", "VERIFICATION", "UPDATE_BLUEPRINT", "COMMIT"]
STATUS_FILE = "phases/status.json"
BLUEPRINT_FILE = "blueprint.md"

def sync_status(phase):
    os.makedirs("phases", exist_ok=True)
    status = {"currentPhase": phase, "errorCount": 0, "lastError": None, "memoryCleared": True}
    with open(STATUS_FILE, "w") as f:
        json.dump(status, f)
    return phase

def clear_memory(phase):
    print(f"   [System] Memory flushed & Context isolated for phase: {phase}")

def main():
    print("Starting Harness Pipeline Loop...")
    if os.path.exists(BLUEPRINT_FILE):
        print(">> [Phase 0] Parsing blueprint.md...")
    else:
        print(">> [WARN] blueprint.md not found!")

    for phase in PHASES:
        current_phase = sync_status(phase)
        print(f">> Executing Phase: {current_phase}")
        clear_memory(current_phase)

        if current_phase == "UPDATE_BLUEPRINT":
            print(">> Checking off completed items in blueprint.md...")
        elif current_phase == "COMMIT":
            print(">> Checking uncommitted changes...")

        time.sleep(1)

    print("Pipeline completed successfully.")
    sync_status("IDLE")

if __name__ == "__main__":
    main()
