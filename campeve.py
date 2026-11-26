import csv
import os
import sys
import webbrowser
import threading
from dataclasses import dataclass
from datetime import date

import matplotlib
matplotlib.use("Agg")  # Non-GUI backend for web server safety
import matplotlib.pyplot as plt
import pandas as pd
from flask import Flask, jsonify, render_template, request, send_file

DATA_DIR = "data"
EVENTS_FILE = os.path.join(DATA_DIR, "events.csv")
STUDENTS_FILE = os.path.join(DATA_DIR, "students.csv")
REGISTRATIONS_FILE = os.path.join(DATA_DIR, "registrations.csv")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback.csv")
CHART_DIR = os.path.join("static", "charts")


class CampusEventError(Exception):
    """Base class for all application errors."""


class InvalidEventIDError(CampusEventError):
    pass


class DuplicateEventError(CampusEventError):
    pass


class StudentNotFoundError(CampusEventError):
    pass


class DuplicateRegistrationError(CampusEventError):
    pass


class EventFullError(CampusEventError):
    pass


class RegistrationNotFoundError(CampusEventError):
    pass


class InvalidRatingError(CampusEventError):
    pass


class DuplicateFeedbackError(CampusEventError):
    pass


# --------------------------------------------------------------------------
# Data classes
# --------------------------------------------------------------------------
@dataclass
class Event:
    event_id: str
    name: str
    date: str          # YYYY-MM-DD
    venue: str
    max_participants: int

    def __str__(self):
        return (f"[{self.event_id}] {self.name} | {self.date} | "
                f"{self.venue} | capacity {self.max_participants}")


@dataclass
class Student:
    student_id: str
    name: str
    email: str

    def __str__(self):
        return f"[{self.student_id}] {self.name} <{self.email}>"


@dataclass
class Registration:
    event_id: str
    student_id: str


@dataclass
class Feedback:
    event_id: str
    student_id: str
    rating: int        # 1-5
    comment: str = ""


# --------------------------------------------------------------------------
# File helpers
# --------------------------------------------------------------------------
def _read_csv(path, fields=None):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write_csv(path, fields, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


# --------------------------------------------------------------------------
# Core manager
# --------------------------------------------------------------------------
class EventManager:
    def __init__(self):
        self.events = {}          # event_id -> Event
        self.students = {}        # student_id -> Student
        self.registrations = []   # list[Registration]
        self.feedback = []        # list[Feedback]
        self.load()

    # ---- persistence ------------------------------------------------------
    def load(self):
        self.events.clear()
        self.students.clear()
        self.registrations.clear()
        self.feedback.clear()

        for r in _read_csv(EVENTS_FILE):
            if not r or not r.get("event_id"):
                continue
            self.events[r["event_id"]] = Event(
                r["event_id"], r["name"], r["date"], r["venue"],
                int(r["max_participants"]))

        for r in _read_csv(STUDENTS_FILE):
            if not r or not r.get("student_id"):
                continue
            self.students[r["student_id"]] = Student(
                r["student_id"], r["name"], r["email"])

        for r in _read_csv(REGISTRATIONS_FILE):
            if not r or not r.get("event_id") or not r.get("student_id"):
                continue
            self.registrations.append(Registration(r["event_id"], r["student_id"]))

        for r in _read_csv(FEEDBACK_FILE):
            if not r or not r.get("event_id") or not r.get("student_id"):
                continue
            self.feedback.append(Feedback(r["event_id"], r["student_id"],
                                          int(r["rating"]), r.get("comment", "")))

    def save(self):
        _write_csv(EVENTS_FILE,
                   ["event_id", "name", "date", "venue", "max_participants"],
                   [vars(e) for e in self.events.values()])
        _write_csv(STUDENTS_FILE, ["student_id", "name", "email"],
                   [vars(s) for s in self.students.values()])
        _write_csv(REGISTRATIONS_FILE, ["event_id", "student_id"],
                   [vars(r) for r in self.registrations])
        _write_csv(FEEDBACK_FILE,
                   ["event_id", "student_id", "rating", "comment"],
                   [vars(f) for f in self.feedback])

    # ---- validation helpers ----------------------------------------------
    def _get_event(self, event_id):
        if event_id not in self.events:
            raise InvalidEventIDError(f"Event ID '{event_id}' does not exist.")
        return self.events[event_id]

    def _get_student(self, student_id):
        if student_id not in self.students:
            raise StudentNotFoundError(
                f"Student ID '{student_id}' is not in the system.")
        return self.students[student_id]

    def participant_count(self, event_id):
        return sum(1 for r in self.registrations if r.event_id == event_id)

    # ---- events -----------------------------------------------------------
    def create_event(self, event_id, name, event_date, venue, max_participants):
        event_id = str(event_id).strip()
        name = str(name).strip()
        venue = str(venue).strip()
        if not event_id:
            raise ValueError("Event ID cannot be empty.")
        if not name:
            raise ValueError("Event name cannot be empty.")
        if event_id in self.events:
            raise DuplicateEventError(f"Event ID '{event_id}' already exists.")
        
        try:
            max_participants = int(max_participants)
        except (ValueError, TypeError):
            raise ValueError("Maximum participants must be a valid number.")

        if max_participants <= 0:
            raise ValueError("Maximum participants must be greater than 0.")

        parsed_date = pd.to_datetime(event_date, format="%Y-%m-%d")   # raises ValueError if invalid date format
        if parsed_date.date() < date.today():
            raise ValueError("Event date cannot be in the past. Please select today or a future date.")
        self.events[event_id] = Event(event_id, name, event_date, venue,
                                      max_participants)
        self.save()
        return self.events[event_id]

    def update_event(self, event_id, **changes):
        event = self._get_event(event_id)
        for key, value in changes.items():
            if value in (None, ""):
                continue
            if key == "max_participants":
                value = int(value)
                if value < self.participant_count(event_id):
                    raise ValueError("New capacity is below current "
                                     "number of registered students.")
            if key == "date":
                parsed_date = pd.to_datetime(value, format="%Y-%m-%d")
                if parsed_date.date() < date.today():
                    raise ValueError("Event date cannot be in the past. Please select today or a future date.")
            setattr(event, key, value)
        self.save()
        return event

    def delete_event(self, event_id):
        self._get_event(event_id)
        del self.events[event_id]
        self.registrations = [r for r in self.registrations
                              if r.event_id != event_id]
        self.feedback = [f for f in self.feedback if f.event_id != event_id]
        self.save()

    # ---- students ---------------------------------------------------------
    def add_student(self, student_id, name, email):
        student_id = str(student_id).strip()
        name = str(name).strip()
        email = str(email).strip()
        if not student_id or not name or not email:
            raise ValueError("Student ID, name, and email are all required.")
        if student_id in self.students:
            raise CampusEventError(f"Student '{student_id}' already exists.")
        self.students[student_id] = Student(student_id, name, email)
        self.save()
        return self.students[student_id]

    def update_student(self, student_id, **changes):
        student = self._get_student(student_id)
        for key in ("name", "email"):
            if key in changes and changes[key] is not None:
                val = str(changes[key]).strip()
                if not val:
                    raise ValueError(f"Student {key} cannot be empty.")
                setattr(student, key, val)
        self.save()
        return student

    def delete_student(self, student_id):
        self._get_student(student_id)
        del self.students[student_id]
        self.registrations = [r for r in self.registrations
                              if r.student_id != student_id]
        self.feedback = [f for f in self.feedback if f.student_id != student_id]
        self.save()

    # ---- registration -----------------------------------------------------
    def register(self, event_id, student_id):
        event = self._get_event(event_id)
        self._get_student(student_id)
        if any(r.event_id == event_id and r.student_id == student_id
               for r in self.registrations):
            raise DuplicateRegistrationError(
                f"Student '{student_id}' is already registered for "
                f"'{event.name}'.")
        if self.participant_count(event_id) >= event.max_participants:
            raise EventFullError(f"'{event.name}' is full "
                                 f"({event.max_participants}/{event.max_participants} seats filled).")
        self.registrations.append(Registration(event_id, student_id))
        self.save()
        return True

    def cancel_registration(self, event_id, student_id):
        self._get_event(event_id)
        for r in self.registrations:
            if r.event_id == event_id and r.student_id == student_id:
                self.registrations.remove(r)
                # drop their feedback too, if any
                self.feedback = [f for f in self.feedback
                                 if not (f.event_id == event_id
                                         and f.student_id == student_id)]
                self.save()
                return True
        raise RegistrationNotFoundError(
            f"Student '{student_id}' is not registered for event "
            f"'{event_id}'.")

    # ---- searching --------------------------------------------------------
    def registered_students(self, event_id, keyword=""):
        """Students registered for an event, optionally filtered by
        a keyword matching student ID, name or email."""
        self._get_event(event_id)
        keyword = keyword.lower().strip()
        result = []
        for r in self.registrations:
            if r.event_id != event_id:
                continue
            s = self.students.get(r.student_id)
            if not s:
                continue
            if (not keyword or keyword in s.student_id.lower()
                    or keyword in s.name.lower()
                    or keyword in s.email.lower()):
                result.append(s)
        return result

    def events_of_student(self, student_id):
        self._get_student(student_id)
        return [self.events[r.event_id] for r in self.registrations
                if r.student_id == student_id and r.event_id in self.events]

    # ---- feedback ---------------------------------------------------------
    def add_feedback(self, event_id, student_id, rating, comment=""):
        self._get_event(event_id)
        self._get_student(student_id)
        if not any(r.event_id == event_id and r.student_id == student_id
                   for r in self.registrations):
            raise RegistrationNotFoundError(
                "Only registered students can leave feedback for this event.")
        try:
            rating = int(rating)
        except (ValueError, TypeError):
            raise InvalidRatingError("Rating must be an integer from 1 to 5.")
        if not 1 <= rating <= 5:
            raise InvalidRatingError("Rating must be an integer from 1 to 5.")
        if any(f.event_id == event_id and f.student_id == student_id
               for f in self.feedback):
            raise DuplicateFeedbackError(
                "This student has already submitted feedback for this event.")
        self.feedback.append(Feedback(event_id, student_id, rating, comment.strip()))
        self.save()
        return True

    # ---- demo data seeder -------------------------------------------------
    def seed_sample_data(self):
        """Populates rich realistic campus data for instant demo/presentation."""
        self.events = {
            "E101": Event("E101", "AI & Robotics Hackathon 2026", "2026-11-15", "Auditorium Hall A", 20),
            "E102": Event("E102", "Annual Tech Career Fair", "2026-11-20", "Campus Innovation Center", 30),
            "E103": Event("E103", "Cloud Computing & DevOps Workshop", "2026-12-05", "Computer Lab 4", 12),
            "E104": Event("E104", "University Cultural Fest & Battle of Bands", "2026-12-18", "Open Air Amphitheater", 50),
        }
        self.students = {
            "S101": Student("S101", "Aarav Sharma", "aarav.sharma@university.edu"),
            "S102": Student("S102", "Priya Nair", "priya.nair@university.edu"),
            "S103": Student("S103", "Rohan Mehta", "rohan.mehta@university.edu"),
            "S104": Student("S104", "Ananya Iyer", "ananya.iyer@university.edu"),
            "S105": Student("S105", "Vikram Reddy", "vikram.reddy@university.edu"),
            "S106": Student("S106", "Sneha Gupta", "sneha.gupta@university.edu"),
            "S107": Student("S107", "Arjun Singh", "arjun.singh@university.edu"),
            "S108": Student("S108", "Kavya Deshmukh", "kavya.deshmukh@university.edu"),
        }
        self.registrations = [
            Registration("E101", "S101"),
            Registration("E101", "S102"),
            Registration("E101", "S103"),
            Registration("E101", "S104"),
            Registration("E102", "S101"),
            Registration("E102", "S103"),
            Registration("E102", "S105"),
            Registration("E102", "S106"),
            Registration("E102", "S107"),
            Registration("E103", "S102"),
            Registration("E103", "S104"),
            Registration("E103", "S108"),
            Registration("E104", "S101"),
            Registration("E104", "S102"),
            Registration("E104", "S105"),
            Registration("E104", "S106"),
            Registration("E104", "S107"),
            Registration("E104", "S108"),
        ]
        self.feedback = [
            Feedback("E101", "S101", 5, "Incredible hackathon! The hardware kits and mentors were world-class."),
            Feedback("E101", "S102", 4, "Challenging problem statements and great chai breaks."),
            Feedback("E101", "S103", 5, "Best tech event of the semester! Learned so much teamwork."),
            Feedback("E102", "S101", 4, "Met top recruiters from Google and Infosys."),
            Feedback("E102", "S105", 5, "Secured a summer internship interview right on the spot!"),
            Feedback("E103", "S102", 5, "Hands-on Kubernetes labs were extremely practical and well-guided."),
            Feedback("E103", "S104", 4, "Clear step-by-step guidance from the industry speaker."),
            Feedback("E104", "S106", 5, "The music lineup was electric! Great campus vibes."),
        ]
        self.save()

    def reset_data(self):
        """Resets all files to empty."""
        self.events = {}
        self.students = {}
        self.registrations = []
        self.feedback = []
        self.save()


# --------------------------------------------------------------------------
# Analysis (Pandas) and charts (Matplotlib)
# --------------------------------------------------------------------------
class Analyzer:
    def __init__(self, manager):
        self.m = manager

    def feedback_df(self):
        return pd.DataFrame([vars(f) for f in self.m.feedback],
                            columns=["event_id", "student_id",
                                     "rating", "comment"])

    def participation_df(self):
        rows = [{"event_id": e.event_id, "event_name": e.name,
                 "participants": self.m.participant_count(e.event_id),
                 "capacity": e.max_participants}
                for e in self.m.events.values()]
        df = pd.DataFrame(rows, columns=["event_id", "event_name",
                                         "participants", "capacity"])
        if not df.empty:
            df["fill_%"] = (df["participants"] / df["capacity"] * 100).round(1)
        else:
            df["fill_%"] = []
        return df

    def summary(self):
        """Event-wise participants, feedback count and average rating."""
        part = self.participation_df()
        if part.empty:
            return part
        fb = self.feedback_df()
        if fb.empty:
            part["avg_rating"] = None
            part["feedback_count"] = 0
            return part

        avg = (fb.groupby("event_id")["rating"]
                 .agg(avg_rating="mean", feedback_count="count")
                 .round(2).reset_index())
        out = part.merge(avg, on="event_id", how="left")
        out["feedback_count"] = out["feedback_count"].fillna(0).astype(int)
        return out

    def overall_average(self):
        fb = self.feedback_df()
        if fb.empty or "rating" not in fb.columns or fb["rating"].isna().all():
            return None
        return round(float(fb["rating"].mean()), 2)

    # ---- charts (modern high-res Matplotlib) ------------------------------
    def _apply_dark_theme(self, fig, ax):
        fig.patch.set_facecolor("#0b0f19")
        ax.set_facecolor("#111827")
        ax.tick_params(colors="#94a3b8", labelsize=10)
        for spine in ax.spines.values():
            spine.set_color("#1f2937")
        ax.grid(axis="y", linestyle="--", alpha=0.25, color="#475569")

    def _finish(self, fig, filename, show=False):
        os.makedirs(CHART_DIR, exist_ok=True)
        path = os.path.join(CHART_DIR, filename)
        fig.tight_layout()
        fig.savefig(path, dpi=150, facecolor=fig.get_facecolor(), edgecolor="none")
        if show:
            plt.show()
        plt.close(fig)
        return path

    def bar_avg_rating(self, show=False):
        s = self.summary()
        if s.empty or "avg_rating" not in s.columns:
            s_clean = pd.DataFrame()
        else:
            s_clean = s.dropna(subset=["avg_rating"])

        fig, ax = plt.subplots(figsize=(8, 4.8), dpi=150)
        self._apply_dark_theme(fig, ax)

        if s_clean.empty:
            ax.text(0.5, 0.5, "No feedback ratings recorded yet\nSubmit student feedback to see chart",
                    ha="center", va="center", color="#64748b", fontsize=13, transform=ax.transAxes)
            ax.set_title("Average Feedback Rating per Event", color="#f8fafc", fontsize=14, fontweight="bold", pad=14)
            return self._finish(fig, "avg_rating_bar.png", show)

        # Truncate long event names for crisp x-axis labels
        labels = [name if len(name) <= 18 else name[:16] + ".." for name in s_clean["event_name"]]
        bars = ax.bar(labels, s_clean["avg_rating"], color="#6366f1", edgecolor="#818cf8", linewidth=1.5, width=0.45)
        
        # Add rating labels on bars
        for bar in bars:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width() / 2, height + 0.12,
                    f"{height:.2f} ★", ha="center", va="bottom",
                    color="#f8fafc", fontweight="bold", fontsize=10)

        ax.set_ylim(0, 5.5)
        ax.set_ylabel("Average Rating (1-5)", color="#cbd5e1", fontsize=11, labelpad=8)
        ax.set_title("Average Feedback Rating per Event", color="#f8fafc", fontsize=14, fontweight="bold", pad=14)
        plt.setp(ax.get_xticklabels(), rotation=20, ha="right", color="#e2e8f0")
        return self._finish(fig, "avg_rating_bar.png", show)

    def histogram_ratings(self, show=False):
        fb = self.feedback_df()
        fig, ax = plt.subplots(figsize=(7.5, 4.8), dpi=150)
        self._apply_dark_theme(fig, ax)

        if fb.empty:
            ax.text(0.5, 0.5, "No feedback submitted yet\nRatings distribution will appear here",
                    ha="center", va="center", color="#64748b", fontsize=13, transform=ax.transAxes)
            ax.set_title("Distribution of Feedback Ratings", color="#f8fafc", fontsize=14, fontweight="bold", pad=14)
            return self._finish(fig, "rating_histogram.png", show)

        # Plot discrete bins 1 to 5
        counts = fb["rating"].value_counts().reindex(range(1, 6), fill_value=0)
        colors = ["#ef4444", "#f97316", "#eab308", "#10b981", "#06b6d4"]
        bars = ax.bar(range(1, 6), counts.values, color=colors, edgecolor="#ffffff22", linewidth=1.2, width=0.55)

        for bar in bars:
            height = bar.get_height()
            if height > 0:
                ax.text(bar.get_x() + bar.get_width() / 2, height + 0.1,
                        f"{int(height)}", ha="center", va="bottom",
                        color="#f8fafc", fontweight="bold", fontsize=10)

        ax.set_xticks(range(1, 6))
        ax.set_xticklabels(["1 Star", "2 Stars", "3 Stars", "4 Stars", "5 Stars"], color="#e2e8f0", fontsize=10)
        ax.set_ylabel("Number of Responses", color="#cbd5e1", fontsize=11, labelpad=8)
        ax.set_title("Distribution of Feedback Ratings (1 - 5 Stars)", color="#f8fafc", fontsize=14, fontweight="bold", pad=14)
        if counts.max() > 0:
            ax.set_ylim(0, counts.max() + 1.5)
        return self._finish(fig, "rating_histogram.png", show)

    def participation_graph(self, show=False):
        p = self.participation_df()
        fig, ax = plt.subplots(figsize=(8.5, 4.8), dpi=150)
        self._apply_dark_theme(fig, ax)

        if p.empty:
            ax.text(0.5, 0.5, "No events created yet\nCreate events to view participation",
                    ha="center", va="center", color="#64748b", fontsize=13, transform=ax.transAxes)
            ax.set_title("Event-wise Participation vs Capacity", color="#f8fafc", fontsize=14, fontweight="bold", pad=14)
            return self._finish(fig, "participation.png", show)

        x = range(len(p))
        width = 0.35
        labels = [name if len(name) <= 18 else name[:16] + ".." for name in p["event_name"]]

        # Dual bars: Capacity vs Registered
        b1 = ax.bar([i - width/2 for i in x], p["capacity"], width, label="Max Capacity", color="#334155", edgecolor="#475569")
        b2 = ax.bar([i + width/2 for i in x], p["participants"], width, label="Registered Students", color="#06b6d4", edgecolor="#22d3ee")

        # Value annotations
        for bar in b2:
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width() / 2, height + 0.2,
                    f"{int(height)}", ha="center", va="bottom",
                    color="#67e8f9", fontweight="bold", fontsize=9)

        ax.set_xticks(list(x))
        ax.set_xticklabels(labels, rotation=20, ha="right", color="#e2e8f0")
        ax.set_ylabel("Number of Students", color="#cbd5e1", fontsize=11, labelpad=8)
        ax.set_title("Event-wise Participation vs Capacity", color="#f8fafc", fontsize=14, fontweight="bold", pad=14)
        ax.legend(facecolor="#1e293b", edgecolor="#334155", labelcolor="#e2e8f0")
        max_val = max(p["capacity"].max(), 5)
        ax.set_ylim(0, max_val + max(2, int(max_val * 0.15)))
        return self._finish(fig, "participation.png", show)

    def generate_all_charts(self):
        """Regenerates all 3 charts with updated data."""
        self.bar_avg_rating(show=False)
        self.histogram_ratings(show=False)
        self.participation_graph(show=False)


# --------------------------------------------------------------------------
# Flask Web Application Setup
# --------------------------------------------------------------------------
def create_app():
    app = Flask(__name__, template_folder="templates", static_folder="static")
    mgr = EventManager()
    ana = Analyzer(mgr)

    # Initial chart generation
    ana.generate_all_charts()

    @app.route("/")
    def index():
        return render_template("index.html")

    # ---- Stats & Analytics ------------------------------------------------
    @app.route("/api/stats", methods=["GET"])
    def get_stats():
        summary_df = ana.summary()
        total_events = len(mgr.events)
        total_students = len(mgr.students)
        total_regs = len(mgr.registrations)
        avg_rating = ana.overall_average()
        total_feedback = len(mgr.feedback)

        # Full events count
        full_events = sum(1 for e in mgr.events.values() if mgr.participant_count(e.event_id) >= e.max_participants)

        return jsonify({
            "total_events": total_events,
            "total_students": total_students,
            "total_registrations": total_regs,
            "overall_average_rating": avg_rating,
            "total_feedback": total_feedback,
            "full_events_count": full_events,
        })

    @app.route("/api/analysis", methods=["GET"])
    def get_analysis():
        df = ana.summary()
        records = []
        if not df.empty:
            for _, row in df.iterrows():
                records.append({
                    "event_id": row["event_id"],
                    "event_name": row["event_name"],
                    "participants": int(row["participants"]),
                    "capacity": int(row["capacity"]),
                    "fill_pct": float(row["fill_%"]) if pd.notna(row["fill_%"]) else 0.0,
                    "avg_rating": float(row["avg_rating"]) if pd.notna(row["avg_rating"]) else None,
                    "feedback_count": int(row["feedback_count"]) if pd.notna(row["feedback_count"]) else 0,
                })
        return jsonify({
            "summary": records,
            "overall_average": ana.overall_average(),
            "total_registrations": len(mgr.registrations),
            "total_feedback": len(mgr.feedback)
        })

    # ---- Events -----------------------------------------------------------
    @app.route("/api/events", methods=["GET"])
    def list_events():
        today = date.today().isoformat()
        events_list = []
        for e in mgr.events.values():
            count = mgr.participant_count(e.event_id)
            is_full = count >= e.max_participants
            status = "Completed" if e.date < today else "Upcoming"
            events_list.append({
                "event_id": e.event_id,
                "name": e.name,
                "date": e.date,
                "venue": e.venue,
                "max_participants": e.max_participants,
                "participants": count,
                "is_full": is_full,
                "available_seats": max(0, e.max_participants - count),
                "fill_pct": round((count / e.max_participants * 100), 1) if e.max_participants > 0 else 0,
                "status": status
            })
        return jsonify(events_list)

    @app.route("/api/events", methods=["POST"])
    def create_event():
        data = request.get_json() or {}
        try:
            event = mgr.create_event(
                event_id=data.get("event_id"),
                name=data.get("name"),
                date=data.get("date"),
                venue=data.get("venue"),
                max_participants=data.get("max_participants")
            )
            ana.generate_all_charts()
            return jsonify({
                "success": True,
                "message": f"Event '{event.name}' created successfully!",
                "event": vars(event)
            }), 201
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    @app.route("/api/events/<event_id>", methods=["PUT"])
    def update_event(event_id):
        data = request.get_json() or {}
        try:
            event = mgr.update_event(
                event_id=event_id,
                name=data.get("name"),
                date=data.get("date"),
                venue=data.get("venue"),
                max_participants=data.get("max_participants")
            )
            ana.generate_all_charts()
            return jsonify({
                "success": True,
                "message": f"Event '{event.name}' updated successfully!",
                "event": vars(event)
            })
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    @app.route("/api/events/<event_id>", methods=["DELETE"])
    def delete_event(event_id):
        try:
            mgr.delete_event(event_id)
            ana.generate_all_charts()
            return jsonify({"success": True, "message": f"Event '{event_id}' deleted."})
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    # ---- Students ---------------------------------------------------------
    @app.route("/api/students", methods=["GET"])
    def list_students():
        students_list = []
        for s in mgr.students.values():
            enrolled = mgr.events_of_student(s.student_id)
            students_list.append({
                "student_id": s.student_id,
                "name": s.name,
                "email": s.email,
                "enrolled_count": len(enrolled),
                "enrolled_events": [{"event_id": e.event_id, "name": e.name} for e in enrolled]
            })
        return jsonify(students_list)

    @app.route("/api/students", methods=["POST"])
    def add_student():
        data = request.get_json() or {}
        try:
            student = mgr.add_student(
                student_id=data.get("student_id"),
                name=data.get("name"),
                email=data.get("email")
            )
            return jsonify({
                "success": True,
                "message": f"Student '{student.name}' added successfully!",
                "student": vars(student)
            }), 201
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    @app.route("/api/students/<student_id>", methods=["PUT"])
    def update_student(student_id):
        data = request.get_json() or {}
        try:
            student = mgr.update_student(
                student_id=student_id,
                name=data.get("name"),
                email=data.get("email")
            )
            return jsonify({
                "success": True,
                "message": f"Student '{student.name}' updated successfully!",
                "student": vars(student)
            })
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    @app.route("/api/students/<student_id>", methods=["DELETE"])
    def delete_student(student_id):
        try:
            mgr.delete_student(student_id)
            ana.generate_all_charts()
            return jsonify({"success": True, "message": f"Student '{student_id}' removed."})
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    # ---- Registrations ----------------------------------------------------
    @app.route("/api/registrations", methods=["GET"])
    def list_registrations():
        regs = []
        for r in mgr.registrations:
            event = mgr.events.get(r.event_id)
            student = mgr.students.get(r.student_id)
            regs.append({
                "event_id": r.event_id,
                "event_name": event.name if event else r.event_id,
                "student_id": r.student_id,
                "student_name": student.name if student else r.student_id,
                "student_email": student.email if student else "",
            })
        return jsonify(regs)

    @app.route("/api/registrations", methods=["POST"])
    def register_student():
        data = request.get_json() or {}
        event_id = data.get("event_id")
        student_id = data.get("student_id")
        try:
            mgr.register(event_id, student_id)
            ana.generate_all_charts()
            return jsonify({
                "success": True,
                "message": f"Student '{student_id}' successfully registered for event '{event_id}'!"
            }), 201
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    @app.route("/api/registrations", methods=["DELETE"])
    def cancel_registration():
        data = request.get_json() or {}
        event_id = data.get("event_id")
        student_id = data.get("student_id")
        try:
            mgr.cancel_registration(event_id, student_id)
            ana.generate_all_charts()
            return jsonify({
                "success": True,
                "message": f"Registration for student '{student_id}' on event '{event_id}' has been cancelled."
            })
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    @app.route("/api/events/<event_id>/students", methods=["GET"])
    def search_registered(event_id):
        keyword = request.args.get("keyword", "")
        try:
            students = mgr.registered_students(event_id, keyword)
            return jsonify([vars(s) for s in students])
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    # ---- Feedback ---------------------------------------------------------
    @app.route("/api/feedback", methods=["GET"])
    def list_feedback():
        items = []
        for f in mgr.feedback:
            event = mgr.events.get(f.event_id)
            student = mgr.students.get(f.student_id)
            items.append({
                "event_id": f.event_id,
                "event_name": event.name if event else f.event_id,
                "student_id": f.student_id,
                "student_name": student.name if student else f.student_id,
                "rating": f.rating,
                "comment": f.comment
            })
        return jsonify(items)

    @app.route("/api/feedback", methods=["POST"])
    def add_feedback():
        data = request.get_json() or {}
        event_id = data.get("event_id")
        student_id = data.get("student_id")
        rating = data.get("rating")
        comment = data.get("comment", "")
        try:
            mgr.add_feedback(event_id, student_id, rating, comment)
            ana.generate_all_charts()
            return jsonify({
                "success": True,
                "message": "Thank you! Your feedback has been recorded."
            }), 201
        except Exception as exc:
            return jsonify({"success": False, "error": str(exc)}), 400

    # ---- Matplotlib Charts ------------------------------------------------
    @app.route("/api/charts/<chart_type>", methods=["GET"])
    def get_chart(chart_type):
        chart_map = {
            "avg_rating_bar": ("avg_rating_bar.png", ana.bar_avg_rating),
            "rating_histogram": ("rating_histogram.png", ana.histogram_ratings),
            "participation": ("participation.png", ana.participation_graph),
        }
        if chart_type not in chart_map:
            return jsonify({"error": "Unknown chart type"}), 404

        filename, generator = chart_map[chart_type]
        generator(show=False)
        path = os.path.join(CHART_DIR, filename)
        return send_file(path, mimetype="image/png")

    @app.route("/api/seed", methods=["POST"])
    def seed_data():
        mgr.seed_sample_data()
        ana.generate_all_charts()
        return jsonify({
            "success": True,
            "message": "Demo data loaded successfully with 4 events, 8 students, registrations, and reviews!"
        })

    @app.route("/api/reset", methods=["POST"])
    def reset_data():
        mgr.reset_data()
        ana.generate_all_charts()
        return jsonify({
            "success": True,
            "message": "All data has been cleared."
        })

    return app, mgr, ana


# --------------------------------------------------------------------------
# Command-line interface (Legacy / Fallback)
# --------------------------------------------------------------------------
MENU = """
===== Campus Event Manager (CLI Mode) =====
 1. Create event              8. Add feedback
 2. List events               9. Analysis summary
 3. Update event             10. Bar chart (avg rating)
 4. Delete event             11. Histogram (ratings)
 5. Add student              12. Participation graph
 6. Register student         13. Student's events
 7. Cancel registration      14. Search registered students
 0. Exit
"""


def ask(prompt):
    return input(prompt).strip()


def run_cli():
    mgr = EventManager()
    ana = Analyzer(mgr)

    while True:
        print(MENU)
        choice = ask("Choose: ")
        try:
            if choice == "1":
                mgr.create_event(ask("Event ID: "), ask("Name: "),
                                 ask("Date (YYYY-MM-DD): "), ask("Venue: "),
                                 int(ask("Max participants: ")))
                print("Event created.")
            elif choice == "2":
                if not mgr.events:
                    print("No events yet.")
                for e in mgr.events.values():
                    print(e, f"| registered: "
                             f"{mgr.participant_count(e.event_id)}")
            elif choice == "3":
                eid = ask("Event ID: ")
                print("Leave blank to keep current value.")
                mgr.update_event(eid, name=ask("New name: "),
                                 date=ask("New date: "),
                                 venue=ask("New venue: "),
                                 max_participants=ask("New capacity: "))
                print("Event updated.")
            elif choice == "4":
                mgr.delete_event(ask("Event ID: "))
                print("Event deleted.")
            elif choice == "5":
                mgr.add_student(ask("Student ID: "), ask("Name: "),
                                ask("Email: "))
                print("Student added.")
            elif choice == "6":
                mgr.register(ask("Event ID: "), ask("Student ID: "))
                print("Registration successful.")
            elif choice == "7":
                mgr.cancel_registration(ask("Event ID: "), ask("Student ID: "))
                print("Registration cancelled.")
            elif choice == "8":
                mgr.add_feedback(ask("Event ID: "), ask("Student ID: "),
                                 int(ask("Rating (1-5): ")),
                                 ask("Comment (optional): "))
                print("Feedback recorded.")
            elif choice == "9":
                s = ana.summary()
                if s.empty:
                    print("No data yet.")
                else:
                    print(s.to_string(index=False))
                    print("\nOverall average rating:",
                          ana.overall_average())
                    print("Total registrations:", len(mgr.registrations))
            elif choice == "10":
                print("Saved:", ana.bar_avg_rating(show=True))
            elif choice == "11":
                print("Saved:", ana.histogram_ratings(show=True))
            elif choice == "12":
                print("Saved:", ana.participation_graph(show=True))
            elif choice == "13":
                for e in mgr.events_of_student(ask("Student ID: ")) or []:
                    print(e)
            elif choice == "14":
                found = mgr.registered_students(
                    ask("Event ID: "), ask("Keyword (ID/name/email): "))
                print("\n".join(map(str, found)) or "No matches.")
            elif choice == "0":
                print("Goodbye!")
                break
            else:
                print("Invalid choice.")
        except ValueError as exc:
            print(f"Invalid input: {exc}")
        except CampusEventError as exc:
            print(f"Error: {exc}")


def open_browser():
    webbrowser.open_new("http://localhost:8080")


if __name__ == "__main__":
    if "--cli" in sys.argv:
        run_cli()
    else:
        app, _, _ = create_app()
        print("=" * 60)
        print(" Campus Event Management & Feedback Analyzer - Web Application")
        print(" Local Web URL: http://localhost:8080")
        print(" (Run with 'python campeve.py --cli' for legacy terminal menu)")
        print("=" * 60)
        threading.Timer(1.2, open_browser).start()
        app.run(host="0.0.0.0", port=8080, debug=False)