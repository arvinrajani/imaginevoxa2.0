'use client';

import { useState, useMemo } from 'react';
import {
  Zap,
  Calendar,
  TrendingUp,
  Clock,
  Target,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchedulingInsights {
  bestTimes: Array<{
    day: string;
    time: string;
    score: number;
    reason: string;
  }>;
  audienceActivity: {
    peakHours: string[];
    peakDays: string[];
  };
  competitorGaps: Array<{
    day: string;
    time: string;
    opportunity: string;
  }>;
  recommendations: string[];
}

interface SmartSchedulerProps {
  brandId: string;
  onSchedule: (datetime: string, postId?: string) => void;
  /** Optional post ID to schedule */
  postId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOURS = [
  '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM',
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM',
  '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
  '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM',
  '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM',
  '8:00 PM',
];

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseTimeString(time: string): { hours: number; minutes: number } {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return { hours: 9, minutes: 0 };
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SmartScheduler({ brandId, onSchedule, postId }: SmartSchedulerProps) {
  const [loading, setLoading] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [insights, setInsights] = useState<SchedulingInsights | null>(null);

  // Calendar state
  const today = new Date();
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('9:00 AM');
  const [showCalendar, setShowCalendar] = useState(false);

  // Recommended days from AI (day abbreviation => score)
  const recommendedDays = useMemo(() => {
    if (!insights) return new Map<string, number>();
    const map = new Map<string, number>();
    insights.bestTimes.forEach((bt) => {
      const idx = DAY_NAMES_FULL.indexOf(bt.day);
      if (idx >= 0) map.set(DAY_NAMES_SHORT[idx], bt.score);
    });
    return map;
  }, [insights]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
    const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth);
    const days: Array<{ day: number; isCurrentMonth: boolean; date: Date; isPast: boolean }> = [];

    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Previous month padding
    const prevMonthDays = getDaysInMonth(calendarYear, calendarMonth - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const date = new Date(calendarYear, calendarMonth - 1, d);
      days.push({ day: d, isCurrentMonth: false, date, isPast: date < todayStart });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(calendarYear, calendarMonth, d);
      days.push({ day: d, isCurrentMonth: true, date, isPast: date < todayStart });
    }

    // Next month padding
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(calendarYear, calendarMonth + 1, d);
      days.push({ day: d, isCurrentMonth: false, date, isPast: false });
    }

    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarYear, calendarMonth]);

  const analyzeOptimalTimes = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/pro/scheduling/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      });

      if (!response.ok) throw new Error('Failed to analyze');

      const data = await response.json();
      setInsights(data);
      toast.success('Analysis complete', { description: 'AI has found your optimal posting times' });
    } catch {
      toast.error('Analysis failed', { description: 'Could not connect to the scheduling API. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSchedulePost = async () => {
    if (!selectedDate || !selectedTime) {
      toast.warning('Select a date and time', { description: 'Pick when you want your post to go live' });
      return;
    }

    const { hours, minutes } = parseTimeString(selectedTime);
    const scheduledFor = new Date(selectedDate);
    scheduledFor.setHours(hours, minutes, 0, 0);

    if (scheduledFor <= new Date()) {
      toast.warning('Invalid time', { description: 'Please select a time in the future' });
      return;
    }

    const isoDate = scheduledFor.toISOString();

    // If we have a postId, actually schedule it via the API
    if (postId) {
      setScheduling(true);
      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId, scheduledFor: isoDate }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to schedule');
        }

        toast.success('Post scheduled!', {
          description: `Your post will go live on ${scheduledFor.toLocaleDateString()} at ${selectedTime}`,
        });
        onSchedule(isoDate, postId);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Please try again';
        toast.error('Scheduling failed', { description: message });
      } finally {
        setScheduling(false);
      }
    } else {
      // No specific post — just pass the time selection up
      toast.success('Time slot selected', {
        description: `${scheduledFor.toLocaleDateString()} at ${selectedTime}`,
      });
      onSchedule(isoDate);
    }
  };

  const selectRecommendedSlot = (slot: { day: string; time: string }) => {
    const dayIndex = DAY_NAMES_FULL.indexOf(slot.day);
    if (dayIndex < 0) return;

    const now = new Date();
    const currentDay = now.getDay();
    let daysUntil = dayIndex - currentDay;
    if (daysUntil <= 0) daysUntil += 7;

    const target = new Date(now);
    target.setDate(target.getDate() + daysUntil);

    setSelectedDate(target);
    setSelectedTime(slot.time);
    setCalendarMonth(target.getMonth());
    setCalendarYear(target.getFullYear());
    setShowCalendar(true);

    toast.info(`${slot.day} at ${slot.time} selected`, { description: 'Review and confirm to schedule' });
  };

  const prevMonth = () => {
    if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear((y) => y - 1); }
    else setCalendarMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear((y) => y + 1); }
    else setCalendarMonth((m) => m + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-blue-900">AI Smart Scheduler</h3>
          <Badge className="ml-auto bg-blue-600">PRO</Badge>
        </div>
        <p className="text-sm text-blue-800 mb-4">
          AI analyzes your audience patterns and finds the perfect time to post for maximum engagement
        </p>
        <div className="flex gap-3">
          <Button
            onClick={analyzeOptimalTimes}
            disabled={loading}
            className="bg-gradient-to-r from-blue-500 to-cyan-500"
          >
            {loading ? (
              <>
                <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                {insights ? 'Re-analyze' : 'Analyze Best Times'}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowCalendar((v) => !v)}
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <CalendarDays className="w-4 h-4 mr-2" />
            {showCalendar ? 'Hide Calendar' : 'Pick Date & Time'}
          </Button>
        </div>
      </Card>

      {/* ─── Calendar + Time Picker ─── */}
      {showCalendar && (
        <Card className="p-6">
          <div className="grid grid-cols-[1fr_200px] gap-6">
            {/* Calendar */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h4 className="font-semibold">
                  {MONTH_NAMES[calendarMonth]} {calendarYear}
                </h4>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_NAMES_SHORT.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((cd, idx) => {
                  const isSelected = selectedDate
                    && cd.date.getFullYear() === selectedDate.getFullYear()
                    && cd.date.getMonth() === selectedDate.getMonth()
                    && cd.date.getDate() === selectedDate.getDate();

                  const isToday =
                    cd.date.getFullYear() === today.getFullYear()
                    && cd.date.getMonth() === today.getMonth()
                    && cd.date.getDate() === today.getDate();

                  const dayName = DAY_NAMES_SHORT[cd.date.getDay()];
                  const recScore = recommendedDays.get(dayName);
                  const isRecommended = !!recScore && cd.isCurrentMonth && !cd.isPast;

                  return (
                    <button
                      key={idx}
                      disabled={cd.isPast && cd.isCurrentMonth}
                      onClick={() => {
                        if (!cd.isPast || !cd.isCurrentMonth) {
                          setSelectedDate(cd.date);
                        }
                      }}
                      className={`relative aspect-square flex items-center justify-center text-sm rounded-lg transition-all ${
                        !cd.isCurrentMonth ? 'text-gray-300' :
                        cd.isPast ? 'text-gray-300 cursor-not-allowed' :
                        isSelected ? 'bg-blue-600 text-white font-bold shadow-lg' :
                        isToday ? 'bg-blue-100 text-blue-700 font-semibold' :
                        isRecommended ? 'bg-green-50 text-green-700 hover:bg-green-100 font-medium' :
                        'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {cd.day}
                      {isRecommended && !isSelected && (
                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-green-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {insights && (
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    AI Recommended
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Today
                  </span>
                </div>
              )}
            </div>

            {/* Time Picker */}
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Time
              </h4>
              <div className="h-[280px] overflow-y-auto space-y-1 pr-1">
                {HOURS.map((time) => {
                  const isSelected = selectedTime === time;
                  const isRecommended = insights?.bestTimes.some((bt) => bt.time === time);

                  return (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`w-full px-3 py-2 rounded-lg text-sm text-left transition-all flex items-center justify-between ${
                        isSelected ? 'bg-blue-600 text-white font-semibold' :
                        isRecommended ? 'bg-green-50 text-green-700 hover:bg-green-100 font-medium' :
                        'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <span>{time}</span>
                      {isRecommended && !isSelected && (
                        <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5">
                          <Target className="w-2.5 h-2.5 mr-0.5" />
                          Best
                        </Badge>
                      )}
                      {isSelected && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Schedule Button */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {selectedDate && selectedTime ? (
                <>
                  <span className="font-medium">Scheduled for: </span>
                  <span className="text-blue-700 font-semibold">
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {selectedTime}
                  </span>
                </>
              ) : (
                'Select a date and time above'
              )}
            </div>
            <Button
              onClick={handleSchedulePost}
              disabled={!selectedDate || !selectedTime || scheduling}
              className="bg-gradient-to-r from-green-500 to-emerald-500"
            >
              {scheduling ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4 mr-2" />
                  {postId ? 'Schedule Post' : 'Select This Time'}
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* ─── AI Insights ─── */}
      {insights && (
        <>
          {/* Best Times */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-green-600" />
              <h4 className="font-semibold">Recommended Times</h4>
              <span className="text-xs text-gray-500 ml-auto">Click a slot to select it</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {insights.bestTimes.map((slot, idx) => {
                const isSelected =
                  selectedTime === slot.time &&
                  selectedDate &&
                  DAY_NAMES_FULL[selectedDate.getDay()] === slot.day;

                return (
                  <div
                    key={idx}
                    onClick={() => selectRecommendedSlot(slot)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold text-lg">{slot.day}</div>
                        <div className="text-2xl font-bold text-green-600">{slot.time}</div>
                      </div>
                      <div className="text-right">
                        <Badge className="bg-green-600">#{idx + 1}</Badge>
                        <div className="text-sm font-semibold text-green-600 mt-1">
                          {slot.score}% match
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{slot.reason}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Audience Insights */}
          <div className="grid grid-cols-2 gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold">Audience Activity</h4>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-2">Peak Hours</p>
                  <div className="flex flex-wrap gap-2">
                    {insights.audienceActivity.peakHours.map((hour) => (
                      <Badge key={hour} variant="outline" className="border-blue-300">
                        <Clock className="w-3 h-3 mr-1" />
                        {hour}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">Peak Days</p>
                  <div className="flex flex-wrap gap-2">
                    {insights.audienceActivity.peakDays.map((day) => (
                      <Badge key={day} variant="outline" className="border-blue-300">
                        <Calendar className="w-3 h-3 mr-1" />
                        {day}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold">Opportunity Windows</h4>
              </div>
              <div className="space-y-3">
                {insights.competitorGaps.map((gap, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-purple-50 rounded-lg cursor-pointer hover:bg-purple-100 transition-colors"
                    onClick={() => selectRecommendedSlot({ day: gap.day, time: gap.time })}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-purple-600">{gap.day}</Badge>
                      <span className="font-semibold text-sm">{gap.time}</span>
                    </div>
                    <p className="text-xs text-gray-600">{gap.opportunity}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Recommendations */}
          <Card className="p-6 bg-gradient-to-br from-amber-50 to-orange-50">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <h4 className="font-semibold text-amber-900">AI Recommendations</h4>
            </div>
            <div className="space-y-2">
              {insights.recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-sm text-amber-900">{rec}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Empty State */}
      {!insights && !loading && !showCalendar && (
        <Card className="p-12 text-center">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Discover Your Perfect Posting Times
          </h3>
          <p className="text-gray-600 mb-6">
            Click &quot;Analyze Best Times&quot; to let AI find when your audience is most active,
            or pick a date &amp; time manually.
          </p>
        </Card>
      )}
    </div>
  );
}
