import { type CSSProperties, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Image as ImageIcon } from "lucide-react";
import type { AvatarAssetRecord, MotionAction, PlannerResponse } from "../../shared/types.js";

interface VirtualPetViewerProps {
  avatar: AvatarAssetRecord | null;
  activePlan: PlannerResponse | null;
  labels: {
    title: string;
    noAvatar: string;
    cachedAsset: string;
    noTokenRuntime: string;
  };
  motionLabels: Record<MotionAction, string>;
}

export function VirtualPetViewer({ avatar, activePlan, labels, motionLabels }: VirtualPetViewerProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const positionRef = useRef(position);
  positionRef.current = position;
  const [target, setTarget] = useState({ x: 0, y: 0 });
  const [facing, setFacing] = useState<1 | -1>(1);
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 });
  const [runtimeAction, setRuntimeAction] = useState<MotionAction | null>(null);
  const [actionUntil, setActionUntil] = useState(0);
  const [sparkles, setSparkles] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const sequence = useMemo(() => {
    if (!avatar) {
      return [];
    }
    const planned = activePlan?.actions
      .map((action) => mapPlannerAction(action.name))
      .filter((action): action is MotionAction => Boolean(action && avatar.frameActions.includes(action))) ?? [];
    const defaults: MotionAction[] = ["idle", "look_at_user", "tail_wag", "head_tilt", "sit"];
    return uniqueActions((planned.length ? planned : defaults).filter((action) => avatar.frameActions.includes(action)));
  }, [activePlan, avatar]);
  const currentAction = runtimeAction ?? sequence[sequenceIndex % Math.max(sequence.length, 1)] ?? "idle";
  const currentFrame = frameForAction(avatar, currentAction, frameIndex);
  const cellAspectRatio = avatar ? frameAspectRatio(avatar) : "192 / 208";
  const travelDistance = Math.hypot(target.x - position.x, target.y - position.y);
  const isTravelling = travelDistance > 8;
  const stageStyle = {
    "--pet-x": `${position.x}px`,
    "--pet-y": `${position.y}px`,
    "--pet-facing": `${facing}`,
    "--look-x": `${pointerOffset.x * 5}px`,
    "--look-y": `${pointerOffset.y * 3}px`
  } as CSSProperties;

  useEffect(() => {
    setSequenceIndex(0);
    setFrameIndex(0);
    setRuntimeAction(null);
    setActionUntil(0);
  }, [activePlan, avatar?.id]);

  useEffect(() => {
    setPosition({ x: 0, y: 0 });
    setTarget({ x: 0, y: 0 });
  }, [avatar?.id]);

  useEffect(() => {
    setFrameIndex(0);
  }, [currentAction]);

  useEffect(() => {
    if (activePlan) setTarget(positionRef.current);
  }, [activePlan]);

  useEffect(() => {
    if (!avatar || sequence.length <= 1) {
      return;
    }
    const timer = window.setInterval(() => {
      setSequenceIndex((value) => value + 1);
    }, activePlan ? 2600 : 3800);
    return () => window.clearInterval(timer);
  }, [activePlan, avatar, sequence.length]);

  useEffect(() => {
    if (!avatar) {
      return;
    }
    const timer = window.setInterval(() => {
      setFrameIndex((value) => value + 1);
    }, activePlan ? 135 : 170);
    return () => window.clearInterval(timer);
  }, [activePlan, avatar]);

  useEffect(() => {
    if (!avatar) {
      return;
    }
    let animationFrame = 0;
    let previousTime = performance.now();
    const tick = (time: number) => {
      const elapsed = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      setPosition((current) => {
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 1) {
          return current;
        }
        const step = Math.min(distance, elapsed * 150);
        return {
          x: current.x + (dx / distance) * step,
          y: current.y + (dy / distance) * step
        };
      });
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activePlan, avatar, target]);

  useEffect(() => {
    if (!avatar || activePlan) {
      return;
    }
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (actionUntil > now) {
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      const anchorWidth = stage.querySelector(".virtual-pet-anchor")?.clientWidth ?? 285;
      const range = Math.max(0, (stage.clientWidth - anchorWidth) / 2 - 16);
      const nextTarget = { x: (Math.random() * 2 - 1) * range, y: (Math.random() * 2 - 1) * 36 };
      setTarget(nextTarget);
      setFacing(nextTarget.x >= positionRef.current.x ? 1 : -1);
      setRuntimeAction(Math.random() > 0.45 ? "stay_near_user" : "idle");
      setActionUntil(now + 1800);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [actionUntil, avatar, activePlan]);

  useEffect(() => {
    if (!runtimeAction) {
      return;
    }
    const timer = window.setTimeout(
      () => {
        if (Date.now() >= actionUntil) {
          setRuntimeAction(null);
        }
      },
      Math.max(120, actionUntil - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [actionUntil, runtimeAction]);

  useEffect(() => {
    if (sparkles.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSparkles((items) => items.slice(1));
    }, 620);
    return () => window.clearTimeout(timer);
  }, [sparkles]);

  const moveToPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const bounds = stage.getBoundingClientRect();
    const anchorWidth = stage.querySelector(".virtual-pet-anchor")?.clientWidth ?? 285;
    const maxX = Math.max(0, (bounds.width - anchorWidth) / 2 - 16);
    const next = {
      x: clamp(event.clientX - bounds.left - bounds.width / 2, -maxX, maxX),
      y: clamp(event.clientY - bounds.top - bounds.height * 0.54, -72, 72)
    };
    setTarget(next);
    setFacing(next.x >= position.x ? 1 : -1);
    setRuntimeAction("approach_user");
    setActionUntil(Date.now() + 2400);
  }, [position.x]);

  const trackPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const bounds = stage.getBoundingClientRect();
    setPointerOffset({
      x: clamp((event.clientX - bounds.left) / bounds.width - 0.5, -1, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height - 0.5, -1, 1)
    });
    if (!runtimeAction && Math.abs((event.clientX - bounds.left) / bounds.width - 0.5) > 0.22) {
      setRuntimeAction("look_at_user");
      setActionUntil(Date.now() + 700);
    }
  }, [runtimeAction]);

  const petPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const stage = stageRef.current;
    const bounds = stage?.getBoundingClientRect();
    const actions: MotionAction[] = ["tail_wag", "head_tilt", "play"];
    setRuntimeAction(actions[Math.floor(Math.random() * actions.length)] ?? "tail_wag");
    setActionUntil(Date.now() + 1800);
    setSparkles((items) => [
      ...items.slice(-5),
      {
        id: Date.now(),
        x: bounds ? event.clientX - bounds.left : 0,
        y: bounds ? event.clientY - bounds.top : 0
      }
    ]);
  }, []);

  return (
    <section className="viewer virtual-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-title">
          <Heart size={16} />
          <span>{labels.title}</span>
        </div>
        {avatar ? (
          <div className="virtual-badge">
            <ImageIcon size={14} />
            <span>{labels.cachedAsset}</span>
          </div>
        ) : null}
      </div>
      {avatar ? (
        <div
          ref={stageRef}
          className={`virtual-stage virtual-action-${isTravelling ? "approach_user" : currentAction}`}
          onPointerDown={moveToPointer}
          onPointerMove={trackPointer}
          style={stageStyle}
        >
          <div className="virtual-stage-floor" />
          <div className="virtual-pet-anchor">
            <div className="virtual-shadow" />
            <div
              className="virtual-sprite"
              onPointerDown={petPointerDown}
              style={{
                backgroundImage: `url(/api/avatar-assets/${avatar.id}/file)`,
                backgroundPosition: framePosition(avatar, currentFrame),
                backgroundSize: `${avatar.frameColumns * 100}% ${avatar.frameRows * 100}%`,
                aspectRatio: cellAspectRatio
              }}
              aria-label={motionLabels[currentAction]}
            />
          </div>
          {sparkles.map((sparkle, index) => (
            <span
              key={sparkle.id}
              className="virtual-spark"
              style={{
                left: sparkle.x,
                top: sparkle.y,
                animationDelay: `${index * 34}ms`
              }}
            />
          ))}
          <div className="atlas-caption">
            <strong>{motionLabels[currentAction]}</strong>
            <span>{avatar.providerModel}</span>
          </div>
        </div>
      ) : (
        <div className="virtual-empty">{labels.noAvatar}</div>
      )}
      <div className="viewer-footer">
        <ImageIcon size={14} />
        <span>{labels.noTokenRuntime}</span>
      </div>
    </section>
  );
}

function frameForAction(avatar: AvatarAssetRecord | null, action: MotionAction, frameIndex: number) {
  if (!avatar) {
    return 0;
  }
  const first = avatar.frameActions.indexOf(action);
  const rowStart = first < 0 ? 0 : Math.floor(first / avatar.frameColumns) * avatar.frameColumns;
  const matchingFrames = avatar.frameActions
    .map((frameAction, index) => (frameAction === action ? index : -1))
    .filter((index) => index >= rowStart && index < rowStart + avatar.frameColumns);
  if (matchingFrames.length === 0) {
    return 0;
  }
  return matchingFrames[frameIndex % matchingFrames.length] ?? matchingFrames[0] ?? 0;
}

function framePosition(avatar: AvatarAssetRecord, index: number) {
  const column = index % avatar.frameColumns;
  const row = Math.floor(index / avatar.frameColumns);
  const x = avatar.frameColumns <= 1 ? 0 : (column / (avatar.frameColumns - 1)) * 100;
  const y = avatar.frameRows <= 1 ? 0 : (row / (avatar.frameRows - 1)) * 100;
  return `${x}% ${y}%`;
}

function frameAspectRatio(avatar: AvatarAssetRecord) {
  const cellWidth = avatar.width / Math.max(avatar.frameColumns, 1);
  const cellHeight = avatar.height / Math.max(avatar.frameRows, 1);
  if (!Number.isFinite(cellWidth) || !Number.isFinite(cellHeight) || cellWidth <= 0 || cellHeight <= 0) {
    return "192 / 208";
  }
  return `${cellWidth} / ${cellHeight}`;
}

function mapPlannerAction(actionName: string): MotionAction | null {
  switch (actionName) {
    case "head_nod":
    case "nod":
    case "head_tilt":
      return "head_tilt";
    case "tail_wag":
    case "tail_sway":
    case "happy":
      return "tail_wag";
    case "approach_user":
      return "approach_user";
    case "stay_near_user":
      return "stay_near_user";
    case "sit":
    case "lie_down":
    case "slow_blink":
      return "sit";
    case "soft_bark":
    case "soft_meow":
      return "look_at_user";
    default:
      return actionName.includes("play") ? "play" : null;
  }
}

function uniqueActions(actions: MotionAction[]) {
  return Array.from(new Set(actions));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
