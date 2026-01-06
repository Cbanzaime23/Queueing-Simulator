
import { describe, it, expect } from 'vitest';
import { calculateEWT, calculateRequiredServers, calculateTheoreticalMetrics, QueueModel, DistributionType } from './mathUtils';

describe('Math Utils', () => {
  
  describe('calculateEWT (Estimated Wait Time)', () => {
    it('should calculate wait time correctly for a single server', () => {
      // 1 person in queue, 1 server, avg service time 10m
      // Rate = 0.1 cust/min.
      // Work = (1 + 1) / 0.1 = 20 minutes
      const result = calculateEWT(1, 1, 10);
      expect(result).toBeCloseTo(20);
    });

    it('should calculate wait time correctly for multiple servers', () => {
      // 4 people in queue, 2 servers, avg service time 10m
      // Server rate = 0.1. System rate = 0.2
      // Work = (4 + 1) / 0.2 = 25 minutes
      const result = calculateEWT(4, 2, 10);
      expect(result).toBeCloseTo(25);
    });

    it('should return infinite wait if no servers are active', () => {
      const result = calculateEWT(5, 0, 10);
      expect(result).toBe(999);
    });
  });

  describe('calculateRequiredServers (Staffing)', () => {
    it('should determine correct staff count for simple load', () => {
      // Lambda = 60/hr, Mu = 20/hr (Service time 3 min)
      // Traffic Intensity (r) = 3.
      // Servers must be > 3 for stability.
      const lambda = 60;
      const mu = 20;
      const targetTimeMin = 0.1; // almost immediate
      const targetPercent = 0.8;

      const servers = calculateRequiredServers(lambda, mu, targetTimeMin, targetPercent);
      expect(servers).toBeGreaterThan(3);
    });
  });

  describe('calculateTheoreticalMetrics (M/M/s)', () => {
    it('should return unstable metrics if rho > 1', () => {
      // Lambda 10, Mu 5, Servers 1 -> Rho = 2 (Unstable)
      const metrics = calculateTheoreticalMetrics(10, 5, 1);
      expect(metrics.isStable).toBe(false);
      expect(metrics.lq).toBe(Infinity);
    });

    it('should calculate correct Lq for M/M/1 stable system', () => {
      // Lambda 0.5, Mu 1.0, s=1 -> Rho = 0.5
      // Lq = rho^2 / (1-rho) = 0.25 / 0.5 = 0.5
      const metrics = calculateTheoreticalMetrics(30, 60, 1, QueueModel.MMS);
      expect(metrics.rho).toBeCloseTo(0.5);
      expect(metrics.lq).toBeCloseTo(0.5);
    });
  });
});
