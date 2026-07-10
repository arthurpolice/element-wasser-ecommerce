'use client'

import type { ApexOptions } from 'apexcharts'
import dynamic from 'next/dynamic'
import { useFormatter, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import {
  DashboardCard,
  DashboardPanel
} from '~/app/[locale]/dashboard/_components/dashboard-ui'
import { api } from '~/trpc/react'

const ApexChart = dynamic(
  () =>
    import('~/app/[locale]/dashboard/_components/overview/apex-chart').then(
      (mod) => mod.ApexChart
    ),
  {
    ssr: false,
    loading: () => (
      <DashboardPanel
        className="flex h-80 items-center justify-center"
        variant="loading"
      >
        …
      </DashboardPanel>
    )
  }
)

type SummaryCardProps = {
  label: string
  value: string
  delayClass?: string
}

const revenueChartPeriods = ['daily', 'monthly', 'yearly'] as const

type RevenueChartPeriod = (typeof revenueChartPeriods)[number]

function SummaryCard({ label, value, delayClass = '' }: SummaryCardProps) {
  return (
    <DashboardCard className={`dashboard-enter ${delayClass}`}>
      <p className="text-dash-muted text-xs font-semibold tracking-wider uppercase">
        {label}
      </p>
      <p className="font-display text-dash-ink mt-3 text-2xl font-semibold tracking-tight">
        {value}
      </p>
    </DashboardCard>
  )
}

export function OverviewTab() {
  const t = useTranslations('Overview')
  const tOrderStatus = useTranslations('OrderStatus')
  const format = useFormatter()
  const [revenueChartPeriod, setRevenueChartPeriod] =
    useState<RevenueChartPeriod>('daily')

  const summaryQuery = api.dashboard.summary.useQuery()
  const timeSeriesQuery = api.dashboard.timeSeries.useQuery({
    period: revenueChartPeriod
  })
  const statusQuery = api.dashboard.orderStatusDistribution.useQuery()

  const isLoading =
    (summaryQuery.isLoading && !summaryQuery.data) || statusQuery.isLoading
  const isError =
    summaryQuery.isError || timeSeriesQuery.isError || statusQuery.isError

  const currentTimeSeries =
    timeSeriesQuery.data?.period === revenueChartPeriod
      ? timeSeriesQuery.data
      : undefined
  const isTimeSeriesLoading = currentTimeSeries == null
  const timeSeriesPoints = useMemo(
    () => currentTimeSeries?.points ?? [],
    [currentTimeSeries?.points]
  )
  const statusCounts = statusQuery.data

  const hasTimeSeriesActivity = timeSeriesPoints.some(
    (point) => point.orderCount > 0 || point.revenueCents > 0
  )
  const totalOrders =
    statusCounts == null
      ? 0
      : statusCounts.PLACED + statusCounts.COMPLETED + statusCounts.CANCELLED

  const formattedDates = useMemo(
    () =>
      timeSeriesPoints.map((point) => {
        if (revenueChartPeriod === 'yearly') {
          return point.date
        }

        const date =
          revenueChartPeriod === 'monthly'
            ? new Date(`${point.date}-01T00:00:00.000Z`)
            : new Date(`${point.date}T00:00:00.000Z`)

        return format.dateTime(
          date,
          revenueChartPeriod === 'monthly'
            ? {
                month: 'short',
                year: 'numeric'
              }
            : {
                month: 'short',
                day: 'numeric'
              }
        )
      }),
    [format, revenueChartPeriod, timeSeriesPoints]
  )

  const revenueSeries = useMemo(
    () => timeSeriesPoints.map((point) => point.revenueCents / 100),
    [timeSeriesPoints]
  )

  const orderSeries = useMemo(
    () => timeSeriesPoints.map((point) => point.orderCount),
    [timeSeriesPoints]
  )

  const timeSeriesOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: 'line',
        animations: { enabled: timeSeriesPoints.length > 0 }
      },
      colors: ['#0ea5b7', '#0a1628'],
      dataLabels: { enabled: false },
      stroke: { width: [0, 3], curve: 'smooth' },
      plotOptions: {
        bar: {
          borderRadius: 4,
          columnWidth: revenueChartPeriod === 'daily' ? '55%' : '42%'
        }
      },
      grid: {
        borderColor: '#d8e0ea',
        strokeDashArray: 4
      },
      legend: {
        position: 'top',
        horizontalAlign: 'left'
      },
      xaxis: {
        categories: formattedDates,
        labels: {
          rotate: -45,
          style: { colors: '#64748b' }
        }
      },
      yaxis: [
        {
          labels: {
            formatter: (value) =>
              format.number(value, {
                style: 'currency',
                currency: 'CHF',
                maximumFractionDigits: 0
              }),
            style: { colors: '#64748b' }
          }
        },
        {
          opposite: true,
          labels: {
            formatter: (value) =>
              format.number(value, { maximumFractionDigits: 0 }),
            style: { colors: '#64748b' }
          }
        }
      ],
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (value, opts) =>
            opts?.seriesIndex === 0
              ? format.number(value, {
                  style: 'currency',
                  currency: 'CHF'
                })
              : format.number(value, { maximumFractionDigits: 0 })
        }
      },
      noData: {
        text: t('charts.noData'),
        align: 'center',
        verticalAlign: 'middle',
        style: { color: '#64748b', fontSize: '14px' }
      }
    }),
    [format, formattedDates, revenueChartPeriod, t, timeSeriesPoints.length]
  )

  const timeSeriesChartSeries = useMemo(
    () => [
      {
        name: t('charts.revenueSeries'),
        type: 'column' as const,
        data: revenueSeries
      },
      {
        name: t('charts.ordersSeries'),
        type: 'line' as const,
        data: orderSeries
      }
    ],
    [orderSeries, revenueSeries, t]
  )

  const statusLabels = useMemo(
    () =>
      statusCounts
        ? ([
            tOrderStatus('PLACED'),
            tOrderStatus('COMPLETED'),
            tOrderStatus('CANCELLED')
          ] as const)
        : ([] as const),
    [statusCounts, tOrderStatus]
  )

  const statusValues = useMemo(
    () =>
      statusCounts
        ? [statusCounts.PLACED, statusCounts.COMPLETED, statusCounts.CANCELLED]
        : [],
    [statusCounts]
  )

  const statusOptions = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: 'donut',
        animations: { enabled: totalOrders > 0 }
      },
      colors: ['#0ea5b7', '#14b8a6', '#94a3b8'],
      labels: [...statusLabels],
      legend: {
        position: 'bottom'
      },
      dataLabels: {
        formatter: (value) =>
          format.number(Number(value) / 100, {
            style: 'percent',
            maximumFractionDigits: 0
          })
      },
      plotOptions: {
        pie: {
          donut: {
            size: '62%',
            labels: {
              show: totalOrders > 0,
              total: {
                show: true,
                label: t('charts.totalOrders'),
                formatter: () => format.number(totalOrders)
              }
            }
          }
        }
      },
      noData: {
        text: t('charts.noData'),
        align: 'center',
        verticalAlign: 'middle',
        style: { color: '#64748b', fontSize: '14px' }
      }
    }),
    [format, statusLabels, t, totalOrders]
  )

  const statusChartSeries = useMemo(
    () => (totalOrders > 0 ? statusValues : []),
    [statusValues, totalOrders]
  )

  if (isLoading) {
    return <DashboardPanel variant="loading">{t('loading')}</DashboardPanel>
  }

  if (isError) {
    return <DashboardPanel variant="danger">{t('error')}</DashboardPanel>
  }

  const summary = summaryQuery.data!

  return (
    <section className="space-y-8">
      <div className="dashboard-enter">
        <h2 className="font-display text-dash-ink text-xl font-semibold tracking-tight">
          {t('title')}
        </h2>
        <p className="text-dash-muted mt-1 text-sm">{t('description')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          delayClass="dashboard-enter-delay-1"
          label={t('cards.revenue')}
          value={format.number(summary.revenueCents / 100, {
            style: 'currency',
            currency: 'CHF'
          })}
        />
        <SummaryCard
          delayClass="dashboard-enter-delay-2"
          label={t('cards.placedOrders')}
          value={format.number(summary.placedOrdersCount)}
        />
        <SummaryCard
          delayClass="dashboard-enter-delay-3"
          label={t('cards.pendingPayments')}
          value={format.number(summary.pendingPaymentsCount)}
        />
        <SummaryCard
          delayClass="dashboard-enter-delay-4"
          label={t('cards.lowStockProducts')}
          value={format.number(summary.lowStockCount)}
        />
        <SummaryCard
          delayClass="dashboard-enter-delay-5"
          label={t('cards.newCustomers')}
          value={format.number(summary.newCustomersCount)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard className="dashboard-enter dashboard-enter-delay-2">
          <div className="mb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-display text-dash-ink text-base font-semibold">
                  {t('charts.revenueOrdersTitle')}
                </h3>
                <p className="text-dash-muted text-sm">
                  {t(`charts.revenueOrdersDescription.${revenueChartPeriod}`)}
                </p>
              </div>
              <div
                aria-label={t('charts.periodLabel')}
                className="border-dash-border inline-flex w-full rounded-lg border bg-[#f6f9fc] p-1 sm:w-auto"
                role="group"
              >
                {revenueChartPeriods.map((period) => {
                  const isSelected = period === revenueChartPeriod

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:flex-none ${
                        isSelected
                          ? 'bg-dash-sidebar text-white shadow-sm'
                          : 'text-dash-muted hover:text-dash-ink hover:bg-white'
                      }`}
                      key={period}
                      onClick={() => setRevenueChartPeriod(period)}
                      type="button"
                    >
                      {t(`charts.periods.${period}`)}
                    </button>
                  )
                })}
              </div>
            </div>
            {!hasTimeSeriesActivity ? (
              <p className="text-dash-muted/80 mt-2 text-sm">
                {t('charts.emptyPeriod')}
              </p>
            ) : null}
          </div>
          {isTimeSeriesLoading ? (
            <DashboardPanel
              className="flex h-80 items-center justify-center"
              variant="loading"
            >
              {t('loading')}
            </DashboardPanel>
          ) : (
            <ApexChart
              height={320}
              key={revenueChartPeriod}
              options={timeSeriesOptions}
              series={timeSeriesChartSeries}
              type="line"
            />
          )}
        </DashboardCard>

        <DashboardCard className="dashboard-enter dashboard-enter-delay-3">
          <div className="mb-4">
            <h3 className="font-display text-dash-ink text-base font-semibold">
              {t('charts.statusTitle')}
            </h3>
            <p className="text-dash-muted text-sm">
              {t('charts.statusDescription')}
            </p>
            {totalOrders === 0 ? (
              <p className="text-dash-muted/80 mt-2 text-sm">
                {t('charts.emptyStatus')}
              </p>
            ) : null}
          </div>
          <ApexChart
            height={320}
            options={statusOptions}
            series={statusChartSeries}
            type="donut"
          />
        </DashboardCard>
      </div>
    </section>
  )
}
