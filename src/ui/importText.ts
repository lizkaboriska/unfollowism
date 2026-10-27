import { IMPORT_WARNINGS, type ImportWarning, type RecognizedFiles } from "../io/analyzeImport.ts";
import { plural } from "./statusText.ts";

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** One line saying what the chosen files contain, e.g. "Following ✓ · Followers ✓ (1 file) · Master: none — a new one will be started". */
export function recognizedText({ hasFollowing, followerFileCount, master }: RecognizedFiles): string {
  const followingPart = `Following ${hasFollowing ? "✓" : "✗"}`;
  const followersPart = followerFileCount ? `Followers ✓ (${plural(followerFileCount, "file")})` : "Followers ✗";
  const masterPart = master
    ? `Master: ${master.name}${master.savedAt ? ` (saved ${formatDateTime(master.savedAt)})` : ""}`
    : "Master: none — a new one will be started";
  return [followingPart, followersPart, masterPart].join(" · ");
}

/** What to add when the selection can't be imported yet. Null when nothing is missing. */
export function missingText({ hasFollowing, followerFileCount }: RecognizedFiles): string | null {
  if (!hasFollowing && !followerFileCount) {
    return "No followers/following files found. Choose the .zip from Instagram (JSON format), or the following.json and followers_*.json files from it.";
  }
  if (!hasFollowing) return "following.json is missing. Choose it together with the other files.";
  if (!followerFileCount) return "followers_1.json (and any followers_2.json, …) is missing. Choose them together with the other files.";
  return null;
}

export function warningText(warning: ImportWarning): string {
  const when = formatDateTime(warning.lastKnownSavedAt);
  return warning.kind === IMPORT_WARNINGS.NO_MASTER_BUT_SAVED_BEFORE
    ? `You saved a master from this browser on ${when}, but didn't choose one. Importing without it starts your review history from scratch.`
    : `The chosen master is older than the one you saved from this browser on ${when}. Recent review work may be missing from it.`;
}
