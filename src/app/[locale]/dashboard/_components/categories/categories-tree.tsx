'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent
} from 'react'
import { useTranslations } from 'next-intl'

import {
  DashboardButton,
  dashInputClass,
  dashTableShellClass
} from '~/app/[locale]/dashboard/_components/dashboard-ui'
import {
  applyOptimisticCategoryCreate,
  applyOptimisticCategoryMove,
  buildCategoryTree,
  dropIntentToMoveInput,
  isCategoryDescendant,
  isOptimisticCategoryId,
  resolveDropIntentFromPointer,
  type CategoryDropIntent,
  type CategoryTreeNode,
  type FlatCategoryRow
} from '~/lib/category-tree'
import { api } from '~/trpc/react'

type DropPreview = {
  targetId: string
  intent: CategoryDropIntent['type']
}

type CategoriesTreeProps = {
  categories: FlatCategoryRow[]
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden
      className={`text-dash-muted h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GripIcon() {
  return (
    <svg
      aria-hidden
      className="text-dash-muted/70 h-4 w-4 shrink-0"
      fill="currentColor"
      viewBox="0 0 16 16"
    >
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="10" cy="4" r="1.2" />
      <circle cx="10" cy="8" r="1.2" />
      <circle cx="10" cy="12" r="1.2" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg
      aria-hidden
      className="text-dash-accent/80 h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type CategoryTreeRowProps = {
  node: CategoryTreeNode
  depth: number
  expandedIds: Set<string>
  onToggle: (categoryId: string) => void
  draftParentId: string | null
  onStartDraft: (parentId: string) => void
  onDelete: (categoryId: string, categoryName: string) => void
  onCancelDraft: () => void
  onCreateDraft: (parentId: string, name: string) => void
  draggedCategoryId: string | null
  keyboardGrabbedId: string | null
  dropPreview: DropPreview | null
  onDragStart: (categoryId: string) => void
  onDragEnd: () => void
  onReleaseGrab: () => void
  onDragOverRow: (
    targetId: string,
    clientY: number,
    rowElement: HTMLElement
  ) => void
  onDropRow: (clientY: number, rowElement: HTMLElement) => void
  onKeyboardGrab: (categoryId: string) => void
  onKeyboardDrop: (targetId: string, intent: CategoryDropIntent['type']) => void
  flatCategories: FlatCategoryRow[]
}

function CategoryTreeRow({
  node,
  depth,
  expandedIds,
  onToggle,
  draftParentId,
  onStartDraft,
  onDelete,
  onCancelDraft,
  onCreateDraft,
  draggedCategoryId,
  keyboardGrabbedId,
  dropPreview,
  onDragStart,
  onDragEnd,
  onReleaseGrab,
  onDragOverRow,
  onDropRow,
  onKeyboardGrab,
  onKeyboardDrop,
  flatCategories
}: CategoryTreeRowProps) {
  const t = useTranslations('Categories.tree')
  const isExpanded = expandedIds.has(node.id)
  const rowRef = useRef<HTMLDivElement>(null)
  const [draftName, setDraftName] = useState('')
  const isPending = isOptimisticCategoryId(node.id)
  const isDraftOpen = draftParentId === node.id
  const isDragging = draggedCategoryId === node.id
  const isGrabbed = keyboardGrabbedId === node.id
  const preview = dropPreview?.targetId === node.id ? dropPreview.intent : null

  useEffect(() => {
    if (!isDraftOpen) {
      setDraftName('')
    }
  }, [isDraftOpen])

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (draftName.trim()) {
        onCreateDraft(node.id, draftName.trim())
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onCancelDraft()
    }
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === ' ' && !keyboardGrabbedId) {
      event.preventDefault()
      onKeyboardGrab(node.id)
      return
    }

    if (!keyboardGrabbedId || keyboardGrabbedId === node.id) {
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      onKeyboardDrop(node.id, 'before')
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      onKeyboardDrop(node.id, 'after')
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onKeyboardDrop(node.id, 'inside')
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      onReleaseGrab()
    }
  }

  return (
    <div className="select-none">
      <div
        ref={rowRef}
        aria-grabbed={isDragging || isGrabbed}
        aria-busy={isPending}
        className={`group border-dash-border/70 relative flex items-center gap-2 border-b px-3 py-2.5 transition-colors ${
          isPending
            ? 'bg-[#f6f9fc]/70'
            : isDragging
              ? 'opacity-40'
              : 'hover:bg-[#f6f9fc]/80'
        } ${preview === 'inside' ? 'bg-dash-accent/8 ring-dash-accent/30 ring-1 ring-inset' : ''}`}
        data-category-id={node.id}
        draggable={!isPending}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          event.preventDefault()
          if (!rowRef.current) {
            return
          }
          onDragOverRow(node.id, event.clientY, rowRef.current)
        }}
        onDragStart={(event: DragEvent) => {
          event.dataTransfer.effectAllowed = 'move'
          onDragStart(node.id)
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (!rowRef.current) {
            return
          }
          onDropRow(event.clientY, rowRef.current)
        }}
        onKeyDown={handleRowKeyDown}
        role="treeitem"
        aria-selected={false}
        style={{ paddingLeft: `${depth * 1.25 + 0.75}rem` }}
        tabIndex={0}
      >
        {preview === 'before' ? (
          <span className="bg-dash-accent pointer-events-none absolute inset-x-3 top-0 h-0.5 rounded-full" />
        ) : null}
        {preview === 'after' ? (
          <span className="bg-dash-accent pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full" />
        ) : null}

        <button
          aria-label={isExpanded ? t('collapse') : t('expand')}
          className="focus-visible:ring-dash-accent/30 rounded p-0.5 transition hover:bg-[#eef3f8] focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => onToggle(node.id)}
          type="button"
        >
          {node.childCount > 0 || node.children.length > 0 ? (
            <ChevronIcon expanded={isExpanded} />
          ) : (
            <span className="inline-block h-4 w-4" />
          )}
        </button>

        <span
          aria-hidden
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <GripIcon />
        </span>

        <FolderIcon />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={`font-medium ${
                isPending ? 'text-dash-muted animate-pulse' : 'text-dash-ink'
              }`}
            >
              {node.name}
            </span>
            {!isPending ? (
              <span className="text-dash-muted font-mono text-xs">
                {node.slug}
              </span>
            ) : null}
            {!isPending ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
                  node.active
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {node.active ? t('statusActive') : t('statusInactive')}
              </span>
            ) : (
              <span className="text-dash-muted animate-pulse text-[10px] font-semibold tracking-wider uppercase">
                {t('creating')}
              </span>
            )}
          </div>
          {!isPending ? (
            <p className="text-dash-muted mt-0.5 text-xs">
              {t('meta', {
                children: node.childCount,
                products: node.productCount
              })}
            </p>
          ) : null}
        </div>

        {!isPending ? (
          <div className="flex shrink-0 items-center gap-2">
            <DashboardButton
              onClick={() => onStartDraft(node.id)}
              variant="ghost"
            >
              {t('addChild')}
            </DashboardButton>
            <DashboardButton
              disabled={node.childCount > 0}
              onClick={() => onDelete(node.id, node.name)}
              variant="ghost"
            >
              {t('delete')}
            </DashboardButton>
          </div>
        ) : null}
      </div>

      {isDraftOpen ? (
        <div
          className="border-dash-border/70 border-b bg-[#f6f9fc]/60 px-3 py-2"
          style={{ paddingLeft: `${(depth + 1) * 1.25 + 0.75}rem` }}
        >
          <input
            autoFocus
            className={`${dashInputClass} max-w-md`}
            onKeyDown={handleDraftKeyDown}
            placeholder={t('draftPlaceholder')}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <p className="text-dash-muted mt-1 text-xs">{t('draftHint')}</p>
        </div>
      ) : null}

      {isExpanded
        ? node.children.map((child) => (
            <CategoryTreeRow
              key={child.id}
              depth={depth + 1}
              draftParentId={draftParentId}
              draggedCategoryId={draggedCategoryId}
              dropPreview={dropPreview}
              expandedIds={expandedIds}
              flatCategories={flatCategories}
              keyboardGrabbedId={keyboardGrabbedId}
              node={child}
              onCancelDraft={onCancelDraft}
              onCreateDraft={onCreateDraft}
              onDragEnd={onDragEnd}
              onDragOverRow={onDragOverRow}
              onDragStart={onDragStart}
              onDropRow={onDropRow}
              onKeyboardDrop={onKeyboardDrop}
              onKeyboardGrab={onKeyboardGrab}
              onReleaseGrab={onReleaseGrab}
              onStartDraft={onStartDraft}
              onDelete={onDelete}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  )
}

export function CategoriesTree({ categories }: CategoriesTreeProps) {
  const t = useTranslations('Categories.tree')
  const utils = api.useUtils()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [draftParentId, setDraftParentId] = useState<string | null>(null)
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(
    null
  )
  const [keyboardGrabbedId, setKeyboardGrabbedId] = useState<string | null>(
    null
  )
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const tree = useMemo(() => buildCategoryTree(categories), [categories])

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current)
      for (const category of categories) {
        if (category.parentId === null) {
          next.add(category.id)
        }
      }
      return next
    })
  }, [categories])

  const createCategory = api.category.create.useMutation({
    onMutate: async (variables) => {
      await utils.category.listFlat.cancel()
      const previous = utils.category.listFlat.getData()
      if (previous) {
        utils.category.listFlat.setData(
          undefined,
          applyOptimisticCategoryCreate(
            previous,
            variables.name,
            variables.parentId ?? null
          ).categories
        )
      }

      setDraftParentId(null)
      setCreateError(null)

      if (variables.parentId) {
        setExpandedIds((current) => new Set(current).add(variables.parentId!))
      }

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        utils.category.listFlat.setData(undefined, context.previous)
      }
      setCreateError(t('createError'))
    },
    onSuccess: async () => {
      setCreateError(null)
      await utils.category.listFlat.invalidate()
      await utils.catalog.navigationTree.invalidate()
    }
  })

  const moveCategory = api.category.move.useMutation({
    onMutate: async (input) => {
      await utils.category.listFlat.cancel()
      const previous = utils.category.listFlat.getData()
      if (previous) {
        utils.category.listFlat.setData(
          undefined,
          applyOptimisticCategoryMove(previous, input)
        )
      }
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.category.listFlat.setData(undefined, context.previous)
      }
      setMoveError(t('moveError'))
    },
    onSuccess: async () => {
      setMoveError(null)
      await utils.category.listFlat.invalidate()
      await utils.catalog.navigationTree.invalidate()
    },
    onSettled: async () => {
      setDraggedCategoryId(null)
      setKeyboardGrabbedId(null)
      setDropPreview(null)
    }
  })

  const deleteCategory = api.category.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.category.listFlat.cancel()
      const previous = utils.category.listFlat.getData()
      if (previous) {
        utils.category.listFlat.setData(
          undefined,
          previous.filter((category) => category.id !== id)
        )
      }
      setDeleteError(null)
      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        utils.category.listFlat.setData(undefined, context.previous)
      }
      setDeleteError(t('deleteError'))
    },
    onSuccess: async () => {
      setDeleteError(null)
      await utils.category.listFlat.invalidate()
      await utils.catalog.navigationTree.invalidate()
    }
  })

  const toggleExpanded = useCallback((categoryId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }, [])

  const performMove = useCallback(
    (draggedId: string, intent: CategoryDropIntent) => {
      if (!draggedId || draggedId === intent.targetId) {
        return
      }

      if (
        intent.type === 'inside' &&
        (isCategoryDescendant(categories, draggedId, intent.targetId) ||
          isOptimisticCategoryId(intent.targetId))
      ) {
        setMoveError(t('invalidDrop'))
        return
      }

      if (
        (intent.type === 'before' || intent.type === 'after') &&
        (isCategoryDescendant(categories, draggedId, intent.targetId) ||
          isOptimisticCategoryId(intent.targetId) ||
          isOptimisticCategoryId(draggedId))
      ) {
        setMoveError(t('invalidDrop'))
        return
      }

      setMoveError(null)
      moveCategory.mutate(dropIntentToMoveInput(draggedId, intent))
    },
    [categories, moveCategory, t]
  )

  function handleDragOverRow(
    targetId: string,
    clientY: number,
    rowElement: HTMLElement
  ) {
    if (!draggedCategoryId) {
      return
    }

    const intent = resolveDropIntentFromPointer(rowElement, clientY)
    setDropPreview({ targetId, intent: intent.type })
  }

  function handleDropRow(clientY: number, rowElement: HTMLElement) {
    if (!draggedCategoryId) {
      return
    }

    const intent = resolveDropIntentFromPointer(rowElement, clientY)
    performMove(draggedCategoryId, intent)
  }

  function handleKeyboardDrop(
    targetId: string,
    intent: CategoryDropIntent['type']
  ) {
    if (!keyboardGrabbedId) {
      return
    }

    performMove(keyboardGrabbedId, { type: intent, targetId })
  }

  function handleDelete(categoryId: string, categoryName: string) {
    if (!window.confirm(t('deleteConfirm', { name: categoryName }))) {
      return
    }

    deleteCategory.mutate({ id: categoryId })
  }

  return (
    <div className="space-y-3">
      <p className="text-dash-muted text-xs">{t('dragHint')}</p>
      {moveError ? (
        <p className="text-dash-danger text-sm">{moveError}</p>
      ) : null}
      {createError ? (
        <p className="text-dash-danger text-sm">{createError}</p>
      ) : null}
      {deleteError ? (
        <p className="text-dash-danger text-sm">{deleteError}</p>
      ) : null}

      <div className={`${dashTableShellClass} overflow-hidden`} role="tree">
        {tree.map((node) => (
          <CategoryTreeRow
            key={node.id}
            depth={0}
            draftParentId={draftParentId}
            draggedCategoryId={draggedCategoryId}
            dropPreview={dropPreview}
            expandedIds={expandedIds}
            flatCategories={categories}
            keyboardGrabbedId={keyboardGrabbedId}
            node={node}
            onCancelDraft={() => setDraftParentId(null)}
            onCreateDraft={(parentId, name) =>
              createCategory.mutate({
                name,
                parentId,
                sortOrder: 0,
                active: true
              })
            }
            onDragEnd={() => {
              setDraggedCategoryId(null)
              setDropPreview(null)
            }}
            onReleaseGrab={() => {
              setDraggedCategoryId(null)
              setKeyboardGrabbedId(null)
              setDropPreview(null)
            }}
            onDragOverRow={handleDragOverRow}
            onDragStart={setDraggedCategoryId}
            onDropRow={handleDropRow}
            onKeyboardDrop={handleKeyboardDrop}
            onKeyboardGrab={setKeyboardGrabbedId}
            onStartDraft={setDraftParentId}
            onDelete={handleDelete}
            onToggle={toggleExpanded}
          />
        ))}
      </div>
    </div>
  )
}
