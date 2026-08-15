"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { changeRoomStateAction } from "@/app/admin/rooms/actions";
import { BackOfficeBookingForm } from "@/components/bookings/back-office-booking-form";
import { CheckoutDialog } from "@/components/operations/checkout-dialog";
import {
  RoomCheckInDialog,
  type RoomCheckInSelection,
} from "@/components/operations/room-check-in-dialog";
import { SubmitRoomStateButton } from "@/components/rooms/submit-room-state-button";
import { Icon } from "@/components/ui/icon";
import type {
  RoomBookingQuickDetail,
  RoomPlanItem,
  RoomSpecies,
} from "@/data/rooms/get-room-plan";
import type { OperationalBooking } from "@/data/operations/list-operations";
import { BOOKING_STATUS_LABELS, CHANNEL_LABELS } from "@/domain/booking/labels";
import {
  ROOM_STATUS_LABELS,
  type RoomDisplayStatus,
} from "@/domain/rooms/status";
import { formatDisplayDate } from "@/domain/shared/date";

const statusStyles: Record<RoomDisplayStatus, string> = {
  AVAILABLE: "border-[#8cc89b] bg-[#C8EAD1] text-[#123c2f]",
  PENDING: "border-[#d6aa45] bg-[#F7D081] text-[#4b3510]",
  CONFIRMED: "border-[#d53136] bg-[#FD464A] text-[#421013]",
  OCCUPIED: "border-[#bd252a] bg-[#FD464A] text-[#421013]",
  CLEANING: "border-slate-400 bg-slate-200 text-slate-800",
  MAINTENANCE: "border-slate-500 bg-slate-300 text-slate-900",
  DISABLED: "border-slate-500 bg-slate-300 text-slate-900",
};

const operationalLabels = {
  AVAILABLE: "พร้อมใช้งาน",
  CLEANING: "รอทำความสะอาด",
  MAINTENANCE: "ปิดซ่อมบำรุง",
  DISABLED: "ปิดใช้งาน",
} as const;

const paymentLabels: Readonly<Record<string, string>> = {
  NOT_REQUIRED: "ไม่ต้องชำระมัดจำ",
  WAITING: "รอชำระ",
  SUBMITTED: "ส่งหลักฐานแล้ว",
  VERIFIED: "ตรวจสอบแล้ว",
  REJECTED: "หลักฐานไม่ผ่าน",
  EXPIRED: "หมดเวลาชำระ",
};

export function RoomPlanningGrid({
  rooms,
  bookingDetails,
  operationalBookings,
  species,
  planDate,
}: {
  readonly rooms: readonly RoomPlanItem[];
  readonly bookingDetails: readonly RoomBookingQuickDetail[];
  readonly operationalBookings: readonly OperationalBooking[];
  readonly species: RoomSpecies;
  readonly planDate: string;
}) {
  const detailsByBookingId = useMemo(
    () => new Map(bookingDetails.map((detail) => [detail.bookingId, detail])),
    [bookingDetails],
  );
  const operationsByBookingId = useMemo(
    () =>
      new Map(
        operationalBookings.map((booking) => [booking.id, booking] as const),
      ),
    [operationalBookings],
  );
  const [selectedRoom, setSelectedRoom] = useState<RoomPlanItem | null>(null);
  const [bookingRoom, setBookingRoom] = useState<RoomPlanItem | null>(null);
  const [checkoutBooking, setCheckoutBooking] =
    useState<OperationalBooking | null>(null);
  const [checkInSelection, setCheckInSelection] =
    useState<RoomCheckInSelection | null>(null);
  const [selectedPet, setSelectedPet] = useState<{
    readonly detail: RoomBookingQuickDetail;
    readonly petId: string;
  } | null>(null);
  const roomDialogRef = useRef<HTMLDialogElement>(null);
  const bookingDialogRef = useRef<HTMLDialogElement>(null);
  const petDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (selectedRoom && roomDialogRef.current && !roomDialogRef.current.open) {
      roomDialogRef.current.showModal();
    }
  }, [selectedRoom]);

  useEffect(() => {
    if (
      bookingRoom &&
      bookingDialogRef.current &&
      !bookingDialogRef.current.open
    ) {
      bookingDialogRef.current.showModal();
    }
  }, [bookingRoom]);

  useEffect(() => {
    if (selectedPet && petDialogRef.current && !petDialogRef.current.open) {
      petDialogRef.current.showModal();
    }
  }, [selectedPet]);

  function closeRoomDialog(): void {
    roomDialogRef.current?.close();
    setSelectedRoom(null);
  }

  function closeBookingDialog(): void {
    bookingDialogRef.current?.close();
    setBookingRoom(null);
  }

  function closePetDialog(): void {
    petDialogRef.current?.close();
    setSelectedPet(null);
  }

  const selectedRoomDetail = selectedRoom?.booking_id
    ? detailsByBookingId.get(selectedRoom.booking_id)
    : undefined;
  const selectedOperationalBooking = selectedRoom?.booking_id
    ? operationsByBookingId.get(selectedRoom.booking_id)
    : undefined;
  const selectedRoomCanCheckIn =
    selectedRoom !== null &&
    selectedRoomDetail !== undefined &&
    ["PENDING_APPROVAL", "APPROVED_AWAITING_DEPOSIT", "CONFIRMED"].includes(
      selectedRoomDetail.bookingStatus,
    );
  const roomPagePath = `/admin/rooms/${species === "CAT" ? "cats" : "dogs"}?date=${planDate}`;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {rooms.map((room) => {
          const quickDetail = room.booking_id
            ? detailsByBookingId.get(room.booking_id)
            : undefined;
          const startsBooking = room.display_status === "AVAILABLE";
          return (
            <article
              key={room.room_id}
              className={`relative min-h-44 cursor-pointer overflow-hidden rounded-2xl border-2 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${statusStyles[room.display_status]}`}
            >
              <button
                type="button"
                onClick={() =>
                  startsBooking ? setBookingRoom(room) : setSelectedRoom(room)
                }
                className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-3 focus-visible:outline-offset-[-4px] focus-visible:outline-[#123c2f]"
                aria-label={
                  startsBooking
                    ? `สร้างรายการจอง ${room.room_code} วันที่ ${formatDisplayDate(planDate)}`
                    : `ดูรายละเอียด ${room.room_code} ${ROOM_STATUS_LABELS[room.display_status]}`
                }
              />
              <div className="pointer-events-none relative z-[1] flex items-start justify-between gap-2">
                <div>
                  <span className="text-lg font-black tracking-wide">
                    {room.room_code}
                  </span>
                  <p className="mt-1 text-xs font-semibold">
                    {ROOM_STATUS_LABELS[room.display_status]}
                  </p>
                </div>
                <Icon
                  name={species === "CAT" ? "cat" : "dog"}
                  className="size-7 shrink-0"
                />
              </div>

              <div className="relative z-10 mt-5 min-h-10 text-xs leading-5">
                {quickDetail?.pets.length ? (
                  quickDetail.pets.map((pet) => (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() =>
                        setSelectedPet({ detail: quickDetail, petId: pet.id })
                      }
                      className="mr-1 mb-1 inline-flex min-h-8 cursor-pointer items-center rounded-full bg-white/70 px-2.5 font-bold underline-offset-2 hover:bg-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      aria-label={`ดูข้อมูล ${pet.name}`}
                    >
                      {pet.name}
                    </button>
                  ))
                ) : room.pet_names.length > 0 ? (
                  room.pet_names.map((name) => (
                    <span
                      key={name}
                      className="mr-1 mb-1 inline-flex rounded-full bg-white/55 px-2 py-0.5 font-semibold"
                    >
                      {name}
                    </span>
                  ))
                ) : room.booking_code ? (
                  <span className="font-semibold">{room.booking_code}</span>
                ) : (
                  <span className="pointer-events-none opacity-75">
                    กดพื้นที่การ์ดเพื่อรับจองห้องนี้
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedRoom(room)}
                className="relative z-10 mt-2 min-h-8 cursor-pointer rounded-lg bg-white/55 px-2.5 text-xs font-semibold hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                จัดการห้อง
              </button>
            </article>
          );
        })}
      </div>

      <dialog
        ref={bookingDialogRef}
        onClose={() => setBookingRoom(null)}
        className="m-auto max-h-[94vh] w-[min(96vw,1120px)] rounded-3xl border-0 bg-[#f5f8f6] p-0 text-[#173f32] shadow-2xl backdrop:bg-black/60"
      >
        {bookingRoom && (
          <div>
            <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-emerald-900/10 bg-white p-5 sm:p-6">
              <div>
                <p className="text-sm font-semibold text-[#2d7a5d]">
                  รับจองโดยพนักงาน
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  สร้างรายการหลังบ้าน · {bookingRoom.room_code}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  ระบบเลือกวันที่ {formatDisplayDate(planDate)}{" "}
                  และห้องนี้ไว้ให้แล้ว
                </p>
              </div>
              <button
                type="button"
                aria-label="ปิดหน้ารับจอง"
                onClick={closeBookingDialog}
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#dcefe4] hover:bg-[#c8ead1] focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Icon name="close" className="size-6" />
              </button>
            </header>
            <div className="p-4 sm:p-6">
              <BackOfficeBookingForm
                key={`${bookingRoom.room_id}-${planDate}`}
                defaultCheckInDate={planDate}
                defaultSpecies={species}
                defaultRoomId={bookingRoom.room_id}
                allowDirectCheckIn
              />
            </div>
          </div>
        )}
      </dialog>

      <dialog
        ref={petDialogRef}
        onClose={() => setSelectedPet(null)}
        className="m-auto max-h-[92vh] w-[min(94vw,680px)] rounded-3xl border-0 bg-white p-0 text-[#173f32] shadow-2xl backdrop:bg-black/55"
      >
        {selectedPet && (
          <PetQuickDetail selection={selectedPet} onClose={closePetDialog} />
        )}
      </dialog>

      <dialog
        ref={roomDialogRef}
        onClose={() => setSelectedRoom(null)}
        className="m-auto max-h-[92vh] w-[min(94vw,620px)] rounded-3xl border-0 bg-white p-0 text-[#173f32] shadow-2xl backdrop:bg-black/55"
      >
        {selectedRoom && (
          <div>
            <header
              className={`flex items-start justify-between gap-4 p-5 sm:p-6 ${statusStyles[selectedRoom.display_status]}`}
            >
              <div>
                <p className="text-sm font-semibold">
                  {ROOM_STATUS_LABELS[selectedRoom.display_status]}
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  {selectedRoom.room_code}
                </h2>
              </div>
              <button
                type="button"
                aria-label="ปิดรายละเอียดห้อง"
                onClick={closeRoomDialog}
                className="grid size-11 place-items-center rounded-xl bg-white/55 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Icon name="close" className="size-6" />
              </button>
            </header>

            <div className="space-y-5 p-5 sm:p-6">
              <dl className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <Detail
                  label="วันที่วางแผน"
                  value={formatDisplayDate(planDate)}
                />
                <Detail
                  label="สถานะระบบห้อง"
                  value={operationalLabels[selectedRoom.operational_status]}
                />
                {selectedRoom.booking_code && (
                  <Detail
                    label="รหัสการจอง"
                    value={selectedRoom.booking_code}
                  />
                )}
                {selectedRoom.pet_names.length > 0 && (
                  <Detail
                    label="สัตว์เลี้ยง"
                    value={selectedRoom.pet_names.join(" / ")}
                  />
                )}
                {selectedRoom.planned_check_in && (
                  <Detail
                    label="วันเข้า"
                    value={formatDisplayDate(selectedRoom.planned_check_in)}
                  />
                )}
                {selectedRoom.planned_check_out && (
                  <Detail
                    label="วันออก"
                    value={formatDisplayDate(selectedRoom.planned_check_out)}
                  />
                )}
              </dl>

              {selectedRoom.display_status === "OCCUPIED" ? (
                <>
                  {selectedRoomDetail && (
                    <RoomOccupantDetail detail={selectedRoomDetail} />
                  )}
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">
                    ห้องนี้มีสัตว์เข้าพักจริงอยู่
                    และจะยังไม่ว่างจนกว่าผู้มีสิทธิ์จะเช็กเอาต์อย่างชัดเจน
                  </div>
                  {selectedOperationalBooking && (
                    <div className="flex justify-end border-t border-slate-200 pt-5">
                      <button
                        type="button"
                        onClick={() => {
                          closeRoomDialog();
                          setCheckoutBooking(selectedOperationalBooking);
                        }}
                        className="min-h-12 rounded-xl bg-[#123c2f] px-6 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        เช็คเอาท์
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <form
                  action={changeRoomStateAction}
                  className="space-y-4 border-t border-slate-200 pt-5"
                >
                  <h3 className="font-bold">เปลี่ยนสถานะการใช้งานห้อง</h3>
                  <input
                    type="hidden"
                    name="roomId"
                    value={selectedRoom.room_id}
                  />
                  <input
                    type="hidden"
                    name="expectedVersion"
                    value={selectedRoom.version}
                  />
                  <input type="hidden" name="species" value={species} />
                  <input type="hidden" name="planDate" value={planDate} />
                  <label className="block text-sm font-semibold">
                    สถานะใหม่
                    <select
                      name="newStatus"
                      defaultValue={selectedRoom.operational_status}
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
                    >
                      <option value="AVAILABLE">พร้อมใช้งาน</option>
                      <option value="CLEANING">รอทำความสะอาด</option>
                      <option value="MAINTENANCE">ปิดซ่อมบำรุง</option>
                      <option value="DISABLED">ปิดใช้งาน</option>
                    </select>
                  </label>
                  <label className="block text-sm font-semibold">
                    เหตุผล
                    <span className="ml-1 font-normal text-slate-500">
                      (จำเป็นเมื่อปิดซ่อมหรือปิดใช้งาน)
                    </span>
                    <textarea
                      name="reason"
                      rows={3}
                      maxLength={500}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <div className="flex flex-wrap justify-end gap-3">
                    {selectedRoomCanCheckIn && selectedRoomDetail && (
                      <button
                        type="button"
                        onClick={() => {
                          const selection: RoomCheckInSelection = {
                            booking: selectedRoomDetail,
                            roomId: selectedRoom.room_id,
                            roomCode: selectedRoom.room_code,
                            idempotencyKey: crypto.randomUUID(),
                          };
                          closeRoomDialog();
                          setCheckInSelection(selection);
                        }}
                        className="min-h-11 rounded-xl bg-[#2d7a5d] px-5 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        เช็คอิน
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeRoomDialog}
                      className="min-h-11 rounded-xl border border-slate-300 px-5 font-semibold"
                    >
                      ยกเลิก
                    </button>
                    <SubmitRoomStateButton />
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </dialog>

      <CheckoutDialog
        key={checkoutBooking?.id ?? "closed-checkout"}
        booking={checkoutBooking}
        returnTo={roomPagePath}
        onClose={() => setCheckoutBooking(null)}
      />
      <RoomCheckInDialog
        key={checkInSelection?.idempotencyKey ?? "closed-room-check-in"}
        selection={checkInSelection}
        returnTo={roomPagePath}
        onClose={() => setCheckInSelection(null)}
      />
    </>
  );
}

function RoomOccupantDetail({
  detail,
}: {
  readonly detail: RoomBookingQuickDetail;
}) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="font-bold">ข้อมูลเจ้าของ</h3>
        <dl className="mt-2 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <Detail label="ชื่อเจ้าของ" value={detail.customerName} />
          <Detail label="เบอร์โทรศัพท์" value={detail.customerPhone} />
          <Detail label="ช่องทาง" value={channelLabel(detail.channel)} />
          <Detail
            label="สถานะการชำระ"
            value={paymentLabels[detail.paymentStatus] ?? "ไม่ทราบสถานะการชำระ"}
          />
        </dl>
      </section>
      <section>
        <h3 className="font-bold">สัตว์เลี้ยงที่กำลังเข้าพัก</h3>
        <div className="mt-2 space-y-3">
          {detail.pets.map((pet) => (
            <dl
              key={pet.id}
              className="grid gap-3 rounded-2xl bg-emerald-50 p-4 text-sm sm:grid-cols-2"
            >
              <Detail label="ชื่อ" value={pet.name} />
              <Detail
                label="ชนิด"
                value={pet.species === "CAT" ? "แมว" : "สุนัข"}
              />
              <Detail
                label="น้ำหนัก"
                value={
                  pet.weightKg === null
                    ? "ยังไม่ได้ระบุ"
                    : `${pet.weightKg} กก.`
                }
              />
              <Detail
                label="ป้องกันเห็บหมัด"
                value={
                  pet.fleaTickTreated === null
                    ? "ยังไม่ได้ระบุ"
                    : pet.fleaTickTreated
                      ? "ทำแล้ว"
                      : "ยังไม่ได้ทำ"
                }
              />
            </dl>
          ))}
        </div>
      </section>
      {(detail.customerNotes || detail.bookingNotes) && (
        <section>
          <h3 className="font-bold">หมายเหตุ</h3>
          <p className="mt-2 rounded-2xl bg-slate-50 p-4 text-sm leading-6">
            {[detail.customerNotes, detail.bookingNotes]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
      )}
    </div>
  );
}

function PetQuickDetail({
  selection,
  onClose,
}: {
  readonly selection: {
    readonly detail: RoomBookingQuickDetail;
    readonly petId: string;
  };
  readonly onClose: () => void;
}) {
  const { detail, petId } = selection;
  const pet = detail.pets.find((item) => item.id === petId) ?? detail.pets[0];
  if (!pet) return null;
  return (
    <div>
      <header className="flex items-start justify-between gap-4 bg-[#dcefe4] p-5 sm:p-6">
        <div>
          <p className="text-sm font-semibold text-[#2d6a50]">
            ข้อมูลสัตว์และเจ้าของแบบด่วน
          </p>
          <h2 className="mt-1 text-2xl font-black">{pet.name}</h2>
          <p className="mt-1 text-sm">{detail.bookingCode}</p>
        </div>
        <button
          type="button"
          aria-label="ปิดข้อมูลสัตว์"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-xl bg-white/70 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="close" className="size-6" />
        </button>
      </header>
      <div className="space-y-5 p-5 sm:p-6">
        <section>
          <h3 className="font-bold">เจ้าของ</h3>
          <dl className="mt-3 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <Detail label="ชื่อเจ้าของ" value={detail.customerName} />
            <Detail label="เบอร์โทรศัพท์" value={detail.customerPhone} />
            <Detail label="ช่องทาง" value={channelLabel(detail.channel)} />
            <Detail
              label="สถานะการจอง"
              value={bookingStatusLabel(detail.bookingStatus)}
            />
            <Detail
              label="สถานะการชำระ"
              value={
                paymentLabels[detail.paymentStatus] ?? "ไม่ทราบสถานะการชำระ"
              }
            />
          </dl>
        </section>
        <section>
          <h3 className="font-bold">สัตว์เลี้ยง</h3>
          <dl className="mt-3 grid gap-3 rounded-2xl bg-emerald-50 p-4 text-sm sm:grid-cols-2">
            <Detail label="ชื่อ" value={pet.name} />
            <Detail
              label="ชนิด"
              value={pet.species === "CAT" ? "แมว" : "สุนัข"}
            />
            <Detail label="เพศ" value="ยังไม่ได้ระบุในข้อมูลฝากเลี้ยง" />
            <Detail label="พันธุ์" value="ยังไม่ได้ระบุในข้อมูลฝากเลี้ยง" />
            <Detail
              label="น้ำหนัก"
              value={
                pet.weightKg === null ? "ยังไม่ได้ระบุ" : `${pet.weightKg} กก.`
              }
            />
            <Detail
              label="ป้องกันเห็บหมัด"
              value={
                pet.fleaTickTreated === null
                  ? "ยังไม่ได้ระบุ"
                  : pet.fleaTickTreated
                    ? "ทำแล้ว"
                    : "ยังไม่ได้ทำ"
              }
            />
            {pet.fleaTickProduct && (
              <Detail label="ผลิตภัณฑ์" value={pet.fleaTickProduct} />
            )}
            {pet.fleaTickTreatedOn && (
              <Detail
                label="วันที่ป้องกันเห็บหมัด"
                value={formatDisplayDate(pet.fleaTickTreatedOn)}
              />
            )}
          </dl>
        </section>
        <section>
          <h3 className="font-bold">ช่วงเข้าพักและหมายเหตุ</h3>
          <dl className="mt-3 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <Detail
              label="วันเข้า"
              value={formatDisplayDate(detail.checkInDate)}
            />
            <Detail
              label="วันออก"
              value={formatDisplayDate(detail.checkOutDate)}
            />
            {(detail.customerNotes ||
              detail.bookingNotes ||
              pet.healthReviewNotes) && (
              <Detail
                label="หมายเหตุ"
                value={[
                  detail.customerNotes,
                  detail.bookingNotes,
                  pet.healthReviewNotes,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}

function bookingStatusLabel(status: string): string {
  return status in BOOKING_STATUS_LABELS
    ? BOOKING_STATUS_LABELS[status as keyof typeof BOOKING_STATUS_LABELS]
    : "ไม่ทราบสถานะการจอง";
}

function channelLabel(channel: string): string {
  return channel in CHANNEL_LABELS
    ? CHANNEL_LABELS[channel as keyof typeof CHANNEL_LABELS]
    : "ไม่ได้ระบุช่องทาง";
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
    </div>
  );
}
