export class Camera {
  x = 0;
  y = 0;

  constructor(private readonly smoothing = 0.14) {}

  follow(targetX: number, targetY: number, viewportWidth: number, viewportHeight: number): void {
    const desiredX = targetX - viewportWidth / 2;
    const desiredY = targetY - viewportHeight * 0.55;
    this.x += (desiredX - this.x) * this.smoothing;
    this.y += (desiredY - this.y) * this.smoothing;
  }
}
