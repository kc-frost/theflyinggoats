import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { UserService } from '../_shared/services/user-service';
import { environment } from '../../_environments/environment';
import { BehaviorSubject } from 'rxjs';
import { DatePipe } from '@angular/common';
import { DestinationCache } from './utils/destination-cache';
import { RouterLink } from "@angular/router";

@Component({
  selector: 'app-profile-page',
  // AsyncPipe subscribes to an Observable/Promise and emits the latest value emitted, and then is marked to be checked for changes
  imports: [ReactiveFormsModule, AsyncPipe, DatePipe, RouterLink],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePage {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef)
  private destcache = inject(DestinationCache);
  private ls = localStorage;
  private formBuilder = inject(FormBuilder);
  private userReservations = new BehaviorSubject<any[]>([]);
  private userBio = new BehaviorSubject<string>("");
  private isEditing = new BehaviorSubject<boolean>(false);
  // added these for editing -Richard
  reservationModalOpen = false;
  selectedReservation: any = null;
  
  departSeatControl = new FormControl('');
  returnSeatControl = new FormControl('');
  departTakenSeats: string[] = [];
  returnTakenSeats: string[] = []

  userService = inject(UserService);
  selectedTab: 'past' | 'upcoming' = 'upcoming'
  staticProfileImage = "/profile/static-profile-image.svg";
  
  editMode: 'bio' | 'profile' | null = null;
  isEditing$ = this.isEditing.asObservable();
  userBio$ = this.userBio.asObservable();
  userTextForm = new FormControl('');

  ngOnInit() {
    this.loadReservations();
    this.loadBio();
    this.loadProfilePicture();

    this.loadUserDests();
    this.loadReviews();
  }

  // Changed cause of DB Changes, I'm not using just date anymore, I'm using datetime
  // We'll see if that breaks anything 
  getDateTime(dateTime: string) {
    return new Date(dateTime);
  }

  loadReservations() {
    this.http.get<any[]>(`${environment.api_url}/api/user-reservations`).subscribe({
      next: (data) => {
        this.userReservations.next(data);
        // console.log(data);
        // load reservations automatically
        this.cdr.detectChanges();
        
      },
      error: (err) => {
        console.log("LOADING RESERVATIONS ERROR:", err);
      }
    })
  }

  get filteredReservations() {
    // todays date
    const pastCutoff = new Date();

    // currently, if the creation of a booking is at least 3 days ago
    // pastCutoff.setDate(pastCutoff.getDate() - 2);
    const allReservations = this.userReservations.value;

    // Changed these two if statements to match DB using datetime now
    // past: descending (most recent first)
    if (this.selectedTab == 'past') {
      return allReservations.filter((reservation) => this.getDateTime(reservation.returnArrivingDate) < pastCutoff)
      .sort((a,b) => 
        this.getDateTime(b.returnArrivingDate).getTime() - this.getDateTime(a.returnArrivingDate).getTime()
      )
    } 

    // upcoming: ascending (soonest first)
    else {
      return allReservations.filter((reservation) => this.getDateTime(reservation.returnArrivingDate) >= pastCutoff)
      .sort((a,b) => 
        this.getDateTime(a.returnArrivingDate).getTime() - this.getDateTime(b.returnArrivingDate).getTime()
      )
    }

  }

  loadBio() {
    this.http.get<{bio: string}>(`${environment.api_url}/api/get-bio`,)
    .subscribe({
      next: (data) => {
        this.userBio.next(data.bio);

        this.cdr.detectChanges();
      },
      error: (err) => console.log(err)
    });
  }

  loadProfilePicture() {
    this.http.get<any>(`${environment.api_url}/api/get-profile-pic`,)
    .subscribe({
      next: (data) => {
        this.userService.profilePicture = data['profilePicture'];
        this.cdr.detectChanges();
      },
      error: (err) => console.log(err)
    })
  }

  save() {
    if (this.editMode == 'bio') {
      this.http.post(`${environment.api_url}/api/save-bio`, 
        { bio: this.userTextForm.value }, 
      ).subscribe({
        next: () => {
          this.isEditing.next(false);
          this.userBio.next(this.userTextForm.value!);
        },
        error: (err) => console.log("SAVE BIO ERROR:", err)
      });
    } else {
      this.http.post(`${environment.api_url}/api/save-profile-picture`,
        { profileURL: this.userTextForm.value},
      ).subscribe({
        next: () => {
          console.log(this.userTextForm.value);
          this.isEditing.next(false);
          this.userService.profilePicture = this.userTextForm.value!;
        },
        error: (err) => console.log("SAVE PROFILE PICTURE ERROR:", err)
      })
    }
  }

  updateBio() { 
    this.editMode = 'bio';
    this.userTextForm.reset();
    this.isEditing.next(true);
  }

  updateProfile() {
    this.editMode = 'profile';
    this.userTextForm.reset();
    this.isEditing.next(true);
  }

  close() {
    this.editMode = null;
    this.isEditing.next(false);
  }

  get userProfile() {
    // if its empty, then load the static image
    return this.userService.profilePicture;
  }

  // Adding these for editing - Richard
  loadTakenSeats(departScheduleID: number, returnScheduleID: number) {
    if (departScheduleID) {
      this.http.get<string[]>(`${environment.api_url}/api/taken-seats`, {
        params: { scheduleID: departScheduleID }
      }).subscribe({
        next: (data) => {
          this.departTakenSeats = (Array.isArray(data) ? data : []).filter(
            seat => seat !== this.selectedReservation.departSeatNumber
          );
          this.cdr.detectChanges();
        }
      });
    }

  if (returnScheduleID) {
    this.http.get<string[]>(`${environment.api_url}/api/taken-seats`, {
      params: { scheduleID: returnScheduleID }
    }).subscribe({
      next: (data) => {
        this.returnTakenSeats = (Array.isArray(data) ? data : []).filter(
          seat => seat !== this.selectedReservation.returnSeatNumber
        );
        this.cdr.detectChanges();
      }
    });
  }
  }

  // Actions themselves (update and delete)
    updateReservationSeats() {
    if (!this.selectedReservation) return;
    if (
      this.isSeatTaken('depart', this.departSeatControl.value) || this.isSeatTaken('return', this.returnSeatControl.value)
    ) {
      return;
    }

    this.http.post(`${environment.api_url}/api/user-update-reservation`, {
      bookingID: this.selectedReservation.bookingNumber,
      departSeat: this.departSeatControl.value,
      returnSeat: this.returnSeatControl.value
    }).subscribe({
      next: () => {
        this.loadReservations();
        this.closeReservationModal();
      },
    error: (err) => {
      console.log("Oops! Something went wrong!:", err);
      alert(err.error?.message || "It looks like you made a bad input! Try again with another input!");
    }
    });
  }
// That includes this too
// This is a soft delete, the booking is still saved in the database in a history table
  deleteReservation() {
    if (!this.selectedReservation) return;
    this.http.post(`${environment.api_url}/api/user-cancel-reservation`, {
      bookingID: this.selectedReservation.bookingNumber
    }).subscribe({
      next: () => {
        this.loadReservations();
        this.closeReservationModal();
      }
    });
  }

  isSeatTaken(type: 'depart' | 'return', seat: string | null) {
    if (!seat) return false;

    // if the seat is the user's current selection, it won't be counted as taken
    return type === 'depart'
      ? this.departTakenSeats.includes(seat) : this.returnTakenSeats.includes(seat);
  }
  openReservationModal(reservation: any, event?: Event) {
    if (this.selectedTab !== 'upcoming') return;
    if (event) {
      // prevent default behavior of the click event like navigating, and then after stop propagation
      event.preventDefault();
      event.stopPropagation();
    }
    this.selectedReservation = reservation;
    // pre-fill update form with current seat selection
    this.departSeatControl.setValue(reservation.departSeatNumber || '');
    this.returnSeatControl.setValue(reservation.returnSeatNumber || '');
    this.departTakenSeats = [];
    this.returnTakenSeats = [];
    this.reservationModalOpen = true;
    this.loadTakenSeats(reservation.departScheduleID, reservation.returnScheduleID);
    this.cdr.detectChanges();
  }
  closeReservationModal() {
    this.reservationModalOpen = false;
    this.selectedReservation = null;
    this.departSeatControl.reset();
    this.returnSeatControl.reset();
    // clear taken seats
    this.departTakenSeats = [];
    this.returnTakenSeats = [];
    this.cdr.detectChanges();
  }

  // TOURIST DESTINATION LOGIC
  private allSights = new BehaviorSubject<any>(null);
  private allDests = new BehaviorSubject<any>(null);
  allSights$ = this.allSights.asObservable();
  allDests$ = this.allDests.asObservable();

  private currentDestSights = new BehaviorSubject<any>(null);
  currentDestSights$ = this.currentDestSights.asObservable();
  currentDest: string = "--Select a city--";

  loadUserDests() {
    this.destcache.loadUserDests().subscribe({
      next: (res) => {
        let arr = [];
        for (let i = 0; i < res.length; i++) {
          arr.push(res[i].userDestinations);
        }

        this.allDests.next(arr);
        this.destcache.cacheCheck(arr);
      }
    })
  }

  loadSight(city: any) {
    this.currentDest = city;

    let possibleSight = this.ls.getItem(this.currentDest!);
    if (possibleSight) {
      const raw = JSON.parse(possibleSight);
      const mapped = raw.map((s: any) => ({
        title: s.title,
        location: this.currentDest,
        desc: s.description,
        rating: s.rating,
        thumbnail: s.thumbnail,
        link: s.link
      }));

      this.currentDestSights.next(mapped);
    } else {
      this.currentDestSights.next(null);
    }
  }

  // this is for css purposes
  getRatingClass(rating: number): string {
    if (rating >= 4) {
      return "rating high";
    } else if (rating >= 2.5) {
      return "rating medium";
    } else {
      return "rating low";
    }
  }
  // How many stars were clicked (by default, 0)
  rating = 0;
  reviewModalOpen = false;
  // Images for the review stars
  star_empty = "/profile/star-empty.svg";
  star_filled = "/profile/star-filled.svg";

  private userReviews = new BehaviorSubject<any[]>([]);
  private currentReview = new BehaviorSubject<any>(null);
  currentReview$ = this.currentReview.asObservable();

  reviewForm = this.formBuilder.group({
    bookingID: ['', Validators.required],
    // userID omitted, derived from python
    rating: ['', Validators.required],
    review: ['', Validators.required]
    // dates will also be handled in python
  })

  // Cannot submit if reviewForm's required fields are not filled out AND
  // a current review already exists for this booking
  get isFormInvalid(): boolean {
    return (this.reviewForm.invalid || this.rating === 0) && !!this.currentReview;
  }

  setRating(rating: number) {
    this.rating = rating;
    this.reviewForm.patchValue({
      rating: String(rating)
    });
  }

  openReviewModal(reservation: any) {
    // find if the current reservation has a review tied to it
    this.reviewForm.patchValue({
      bookingID: reservation.bookingNumber
    });
    this.currentReview.next(
      this.userReviews.getValue().find((r:any) => r.bookingID === reservation.bookingNumber) ?? null
    )

    this.rating = this.currentReview.getValue() ? this.currentReview.value.rating : 0;

    this.reviewModalOpen = true;
  }

  closeReviewModal() {
    this.rating = 0;
    this.reviewForm.reset();
    this.currentReview.next("");
    this.reviewModalOpen = false;
  }

  submitReview() {
    this.http.post(`${environment.api_url}/api/add-review`,
      this.reviewForm.value).subscribe({
        next: (res) => {
          // console.log(res);
          this.loadReviews();
          this.closeReviewModal();
        }
      })
  }

  deleteReview(ratingID: any) {
    this.http.post(`${environment.api_url}/api/delete-review`,
      ratingID).subscribe({
        next: (res) => {
          // console.log(res);
          this.loadReviews();
          this.closeReviewModal();
        }
      })
  }

  loadReviews() {
    this.http.get<[]>(`${environment.api_url}/api/get-reviews`).subscribe({
      next: (res) => {
        this.userReviews.next(res);
        console.log(res);
      }
    })
  }

  // TEST FUNCTION FOR BUTTONS
  test() { console.log("hello")};
}
