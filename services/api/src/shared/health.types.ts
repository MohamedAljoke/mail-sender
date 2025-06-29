export interface HealthCheck {
  status: string;
  message?: string;
  timestamp: Date;
  latency?: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  isRunning: boolean;
  timestamp: Date;
  dependencies?: Record<string, HealthCheck>;
}

export enum HealthStatus {
  HEALTHY = "healthy",
  UNHEALTHY = "unhealthy",
  DEGRADED = "degraded"
}

export class HealthResponseBuilder {
  private response: HealthResponse;

  constructor(service: string, isRunning: boolean = true) {
    this.response = {
      status: HealthStatus.HEALTHY,
      service,
      isRunning,
      timestamp: new Date(),
      dependencies: {}
    };
  }

  addDependencyCheck(name: string, status: HealthStatus, message?: string, latency?: string): this {
    if (!this.response.dependencies) {
      this.response.dependencies = {};
    }
    
    this.response.dependencies[name] = {
      status,
      message,
      timestamp: new Date(),
      latency
    };
    
    this.updateOverallStatus();
    return this;
  }

  build(): HealthResponse {
    return this.response;
  }

  private updateOverallStatus(): void {
    if (!this.response.isRunning) {
      this.response.status = HealthStatus.UNHEALTHY;
      return;
    }

    if (!this.response.dependencies) {
      return;
    }

    let hasUnhealthy = false;
    let hasDegraded = false;

    Object.values(this.response.dependencies).forEach(dep => {
      if (dep.status === HealthStatus.UNHEALTHY) {
        hasUnhealthy = true;
      } else if (dep.status === HealthStatus.DEGRADED) {
        hasDegraded = true;
      }
    });

    if (hasUnhealthy) {
      this.response.status = HealthStatus.UNHEALTHY;
    } else if (hasDegraded) {
      this.response.status = HealthStatus.DEGRADED;
    } else {
      this.response.status = HealthStatus.HEALTHY;
    }
  }
}