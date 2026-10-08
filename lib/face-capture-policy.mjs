export const FACE_REGISTER_COUNT = 5;
export const FACE_LOGIN_COUNT = 3;

export function faceCapturePolicy(purpose = "register") {
  if (purpose !== "register" && purpose !== "login")
    throw new RangeError("Finalidade facial inválida.");
  return {
    count: purpose === "login" ? FACE_LOGIN_COUNT : FACE_REGISTER_COUNT,
    centerTolerance: 0.35,
    turnMinimum: 0.10,
    // Login needs only natural camera variation; enrollment keeps movement.
    minimumFrameDifference: purpose === "login" ? 0.05 : 0.25,
    firstFrameDelayMs: purpose === "login" ? 800 : 1800,
    centerDelayMs: purpose === "login" ? 400 : 1200,
    turnDelayMs: 2100,
  };
}

export function captureDelayMs(purpose, pose, index) {
  const policy = faceCapturePolicy(purpose);
  return index === 0 ? policy.firstFrameDelayMs : pose === "center" ? policy.centerDelayMs : policy.turnDelayMs;
}

export function acceptsFacePose(yaw, pose, purpose = "register") {
  if (!Number.isFinite(yaw)) return false;
  const policy = faceCapturePolicy(purpose);
  if (pose === "center") return Math.abs(yaw) <= policy.centerTolerance;
  if (purpose === "login") return false;
  if (pose === "left") return yaw <= -policy.turnMinimum;
  if (pose === "right") return yaw >= policy.turnMinimum;
  return false;
}
