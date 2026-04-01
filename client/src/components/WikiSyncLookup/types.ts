/**
 * Client-side mirror of the WikiSync API response shape.
 *
 * Mirrors server/src/types/wikiSync.ts — kept separate so the client has
 * no build-time dependency on the server's TypeScript source.
 */
export interface WikiSyncImportResult {
  username:                 string;
  sourcePage:               string;
  syncedAt:                 string;
  success:                  boolean;
  personalisationSucceeded: boolean;
  personalisationNote:      string;
  completionDetectionMethod: string;
  completionPercent:        number | null;
  completionPercentRaw:     string | null;
  completedTaskIds:         string[];
  completedTaskNames:       string[];
  completedUnmatchedNames:  string[];
  unlockedAreas:            string[];
  notes:                    string[];
  summary: {
    totalTasksFound:     number;
    completedTasksFound: number;
    matchedToAppId:      number;
    unmatchedNames:      number;
  };
  rawExtra: Record<string, unknown>;
}
