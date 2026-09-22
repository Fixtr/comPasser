// Source deletion does not mutate the shared document itself. Recheck server
// access explicitly instead of relying on a shared-document change listener.
export function watchSharedAccess(readExists, onInvalidated, {
    intervalMs = 15000, timeoutMs = 8000,
    schedule = setTimeout, cancel = clearTimeout,
} = {}) {
    let stopped = false, timer, deadline;
    const stop = () => {
        stopped = true;
        cancel(timer);
        cancel(deadline);
    };
    const check = async () => {
        let valid = false;
        try {
            valid = await Promise.race([
                Promise.resolve().then(readExists),
                new Promise(resolve => { deadline = schedule(() => resolve(false), timeoutMs); }),
            ]);
        } catch { /* Any unconfirmed access fails closed, never renders cached data. */ }
        cancel(deadline);
        if (stopped) return;
        if (!valid) {
            stop();
            onInvalidated();
        } else timer = schedule(check, intervalMs);
    };
    timer = schedule(check, intervalMs);
    return stop;
}
