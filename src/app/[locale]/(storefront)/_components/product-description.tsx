import type { JSONContent } from '@tiptap/react'
import type { ReactNode } from 'react'
import type { Prisma } from '../../../../../generated/prisma/client'

type ProductDescriptionProps = {
  description: Prisma.JsonValue
}

type ProductDescriptionNode = JSONContent & {
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

function isProductDescriptionNode(
  value: unknown
): value is ProductDescriptionNode {
  return Boolean(value && typeof value === 'object' && 'type' in value)
}

function isProductDescriptionDocument(
  value: Prisma.JsonValue
): value is ProductDescriptionNode {
  return (
    isProductDescriptionNode(value) &&
    value.type === 'doc' &&
    Array.isArray(value.content)
  )
}

function getSafeHref(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const href = value.trim()
  if (!href) {
    return null
  }

  if (href.startsWith('/')) {
    return href
  }

  try {
    const url = new URL(href)
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
      return href
    }
  } catch {
    return null
  }

  return null
}

function applyMarks(
  children: ReactNode,
  marks: ProductDescriptionNode['marks'] = [],
  key: string
) {
  return marks.reduce<ReactNode>((markedChildren, mark, index) => {
    const markKey = `${key}-mark-${index}`

    switch (mark.type) {
      case 'bold':
        return <strong key={markKey}>{markedChildren}</strong>
      case 'italic':
        return <em key={markKey}>{markedChildren}</em>
      case 'link': {
        const href = getSafeHref(mark.attrs?.href)

        if (!href) {
          return markedChildren
        }

        return (
          <a href={href} key={markKey}>
            {markedChildren}
          </a>
        )
      }
      default:
        return markedChildren
    }
  }, children)
}

function renderChildren(
  node: ProductDescriptionNode,
  keyPrefix: string
): ReactNode {
  return node.content?.map((child, index) =>
    renderNode(child, `${keyPrefix}-${index}`)
  )
}

function renderNode(node: ProductDescriptionNode, key: string): ReactNode {
  switch (node.type) {
    case 'text':
      return applyMarks(node.text ?? '', node.marks, key)
    case 'heading': {
      if (node.attrs?.level === 3) {
        return <h3 key={key}>{renderChildren(node, key)}</h3>
      }

      return <h2 key={key}>{renderChildren(node, key)}</h2>
    }
    case 'paragraph':
      return <p key={key}>{renderChildren(node, key)}</p>
    case 'bulletList':
      return <ul key={key}>{renderChildren(node, key)}</ul>
    case 'orderedList':
      return <ol key={key}>{renderChildren(node, key)}</ol>
    case 'listItem':
      return <li key={key}>{renderChildren(node, key)}</li>
    case 'hardBreak':
      return <br key={key} />
    default:
      return <>{renderChildren(node, key)}</>
  }
}

export function ProductDescription({ description }: ProductDescriptionProps) {
  if (!isProductDescriptionDocument(description)) {
    return null
  }

  return (
    <div className="store-product-description">
      {description.content?.map((node, index) =>
        renderNode(node, `description-${index}`)
      )}
    </div>
  )
}
