import { useState, type DragEvent } from 'react';

/** Handlers that let files be dropped on a box; `isDragging` (files held over it) turns its frame blue. */
export interface DropTarget {
  isDragging: boolean;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

/** A box files can be dropped on; `onFiles` gets the dropped files. */
export function useDropZone(onFiles: (files: File[]) => void): DropTarget {
  const [isDragging, setIsDragging] = useState(false);
  return {
    isDragging,
    onDragOver: event => {
      event.preventDefault();
      setIsDragging(true);
    },
    // Moving over the text inside also fires dragleave; only leaving the box itself ends the highlight.
    onDragLeave: event => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
        setIsDragging(false);
      }
    },
    onDrop: event => {
      event.preventDefault();
      setIsDragging(false);
      onFiles([...event.dataTransfer.files]);
    },
  };
}
