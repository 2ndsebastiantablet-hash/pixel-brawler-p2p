export class HostOfferCoordinator {
  private offerCreated = false;

  shouldCreateOffer(isHost: boolean, peerCount: number): boolean {
    if (!isHost || this.offerCreated || peerCount < 2) {
      return false;
    }
    this.offerCreated = true;
    return true;
  }

  reset(): void {
    this.offerCreated = false;
  }
}
