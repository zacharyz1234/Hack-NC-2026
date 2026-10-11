import {
  NavigationContext,
  type ReturnDestination,
} from "@/lib/gill-navigation-context";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "@tanstack/react-router";

export function GillNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [transitioning, setTransitioning] = useState(false);
  const locked = useRef(false);
  const committing = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    locked.current = false;
  };
  useEffect(() => {
    const unsubscribe = router.subscribe("onBeforeNavigate", () => {
      if (!committing.current) {
        clear();
        setTransitioning(false);
      }
    });
    return () => {
      unsubscribe();
      clear();
    };
  }, [router]);
  function transition(commit: () => void | Promise<unknown>) {
    if (locked.current) return;
    locked.current = true;
    setTransitioning(!reducedMotion);
    const perform = () => {
      committing.current = true;
      Promise.resolve(commit())
        .catch(() => {
          clear();
          setTransitioning(false);
        })
        .finally(() => {
          committing.current = false;
        });
    };
    if (reducedMotion) {
      perform();
      timers.current.push(
        setTimeout(() => {
          clear();
          setTransitioning(false);
        }, 100),
      );
      return;
    }
    timers.current.push(setTimeout(perform, 1200));
    timers.current.push(
      setTimeout(() => {
        clear();
        setTransitioning(false);
      }, 5200),
    );
  }
  function openGill(returnTo: ReturnDestination, initialQuestion = "") {
    transition(() =>
      router.navigate({ to: "/gill", search: { returnTo, initialQuestion } }),
    );
  }
  const transitionBubbles = useMemo(() => {
    const rand = (count: number, phase: "out" | "in") =>
      Array.from({ length: count }, () => ({
        left: -10 + Math.random() * 100,
        size: 18 + Math.random() * 26,
        // Out wave rises and fades away first; in wave spawns from mid-screen
        // just as the turquoise cover starts fading back out, drifting slowly
        // upward so it reads as a continuation.
        delay:
          phase === "out" ? Math.random() * 0.2 : 1.45 + Math.random() * 0.3,
        duration:
          phase === "out"
            ? 1.1 + Math.random() * 0.4
            : 2.6 + Math.random() * 0.6,
        bottom: phase === "out" ? -60 : 35 + Math.random() * 20,
        phase,
      }));
    return [...rand(9, "out"), ...rand(9, "in")];
  }, []);
  return (
    <NavigationContext.Provider value={{ transitioning, transition, openGill }}>
      {children}
      <>
        {transitioning && (
          <motion.div
            key="bowl-street-bubbles"
            className="bubble-transition"
            aria-hidden="true"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.01 }}
          >
            {(["out", "in"] as const).map((phase) => (
              <Fragment key={phase}>
                {phase === "in" && (
                  <motion.div
                    className="bubble-transition-cover"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: reducedMotion ? 0 : [0, 1, 1, 0] }}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : {
                            duration: 2.0,
                            delay: 0.4,
                            times: [0, 0.33, 0.6, 1],
                            ease: "easeInOut",
                          }
                    }
                  />
                )}
                {transitionBubbles.map((b, i) => {
                  if (b.phase !== phase) return null;
                  const isOut = phase === "out";
                  const delay = reducedMotion ? 0 : b.delay;
                  return (
                    <motion.span
                      key={i}
                      className="transition-bubble"
                      style={{
                        left: `${b.left}%`,
                        width: `${b.size}vw`,
                        bottom: `${b.bottom}vh`,
                      }}
                      initial={{
                        y: reducedMotion ? "-200vh" : "0vh",
                        opacity: 0,
                      }}
                      animate={
                        reducedMotion
                          ? { y: "-200vh", opacity: 0 }
                          : {
                              y: isOut ? "-130vh" : "-120vh",
                              opacity: [0, 1, 1, 0],
                            }
                      }
                      transition={{
                        duration: reducedMotion ? 0 : b.duration,
                        delay,
                        ease: "easeOut",
                        opacity: reducedMotion
                          ? { duration: 0 }
                          : isOut
                            ? {
                                duration: b.duration,
                                delay,
                                times: [0, 0.15, 0.7, 1],
                              }
                            : {
                                duration: b.duration,
                                delay,
                                times: [0, 0.1, 0.65, 1],
                              },
                      }}
                    />
                  );
                })}
              </Fragment>
            ))}
          </motion.div>
        )}
      </>
    </NavigationContext.Provider>
  );
}
