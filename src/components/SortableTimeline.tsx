import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Clip } from "@/types";
import { ClipCard } from "@/components/ClipCard";

interface SortableTimelineProps {
  clips: Clip[];
  setClips: (clips: Clip[]) => void;
  onPreview: (clipId: string) => void;
  onTrim: (clipId: string) => void;
  onToggleMute: (clipId: string) => void;
  onDuplicate: (clipId: string) => void;
  onRemove: (clipId: string) => void;
  onTransitionChange: (clipId: string, transition: Clip["transitionToNext"]) => void;
  onMoveLeft: (clipId: string) => void;
  onMoveRight: (clipId: string) => void;
}

interface SortableClipItemProps {
  clip: Clip;
  index: number;
  onPreview: (clipId: string) => void;
  onTrim: (clipId: string) => void;
  onToggleMute: (clipId: string) => void;
  onDuplicate: (clipId: string) => void;
  onRemove: (clipId: string) => void;
  onTransitionChange: (clipId: string, transition: Clip["transitionToNext"]) => void;
  onMoveLeft: (clipId: string) => void;
  onMoveRight: (clipId: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

const SortableClipItem = ({ clip, ...props }: SortableClipItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: clip.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className="touch-none transition-transform duration-200"
    >
      <ClipCard clip={clip} isDragging={isDragging} {...props} />
    </div>
  );
};

export const SortableTimeline = ({ clips, setClips, ...props }: SortableTimelineProps) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = clips.findIndex((clip) => clip.id === active.id);
    const newIndex = clips.findIndex((clip) => clip.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setClips(arrayMove(clips, oldIndex, newIndex));
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Movie Timeline</h2>
        <p className="text-xs text-slate-400">Drag clips to set final order</p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={clips.map((clip) => clip.id)} strategy={horizontalListSortingStrategy}>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/30 p-3">
            <div className="flex min-w-max items-stretch gap-3">
              {clips.map((clip, index) => (
                <SortableClipItem
                  key={clip.id}
                  clip={clip}
                  index={index}
                  isFirst={index === 0}
                  isLast={index === clips.length - 1}
                  {...props}
                />
              ))}
            </div>
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
};
