import type { DiffReviewFile } from "./types";

export const SAMPLE_DIFF_FILES: DiffReviewFile[] = [
  {
    path: "src/widgets/diff/DiffReviewWidget.tsx",
    status: "A",
    patch: `diff --git a/src/widgets/diff/DiffReviewWidget.tsx b/src/widgets/diff/DiffReviewWidget.tsx
new file mode 100644
index 0000000..4cf4b82
--- /dev/null
+++ b/src/widgets/diff/DiffReviewWidget.tsx
@@ -0,0 +1,12 @@
+import { DiffReviewToolbar } from "./DiffReviewToolbar";
+
+export function DiffReviewWidget() {
+  return (
+    <section>
+      <DiffReviewToolbar />
+      <div>Diff review ready.</div>
+    </section>
+  );
+}
+
+export default DiffReviewWidget;
`
  },
  {
    path: "src/widgets/diff/DiffReviewToolbar.tsx",
    status: "M",
    patch: `diff --git a/src/widgets/diff/DiffReviewToolbar.tsx b/src/widgets/diff/DiffReviewToolbar.tsx
index 5689201..e1e3d31 100644
--- a/src/widgets/diff/DiffReviewToolbar.tsx
+++ b/src/widgets/diff/DiffReviewToolbar.tsx
@@ -1,10 +1,14 @@
 type Props = {
-  title: string;
+  title: string;
+  onCopyPath: () => void;
 };
 
-export function DiffReviewToolbar({ title }: Props) {
+export function DiffReviewToolbar({ title, onCopyPath }: Props) {
   return (
-    <header>{title}</header>
+    <header className="toolbar">
+      <h2>{title}</h2>
+      <button onClick={onCopyPath}>复制路径</button>
+    </header>
   );
 }
`
  },
  {
    path: "src/widgets/diff/LegacyDiffEditor.tsx",
    status: "D",
    patch: `diff --git a/src/widgets/diff/LegacyDiffEditor.tsx b/src/widgets/diff/LegacyDiffEditor.tsx
deleted file mode 100644
index d3af623..0000000
--- a/src/widgets/diff/LegacyDiffEditor.tsx
+++ /dev/null
@@ -1,8 +0,0 @@
-import { useState } from "react";
-
-export function LegacyDiffEditor() {
-  const [value, setValue] = useState("");
-  return <textarea value={value} onChange={(event) => setValue(event.target.value)} />;
-}
-
-export default LegacyDiffEditor;
`
  }
];
