import SwiftUI

/// The full view's backdrop: a quiet sky.
///
/// Drawn rather than shipped. A bitmap would mean sourcing and licensing art,
/// carrying it in the bundle, and re-cutting it for every display scale; this is
/// gradients and blurred ellipses, so it is a few hundred bytes of code, sharp
/// at any size, and free to retune.
///
/// The hard constraint is that it must never compete with the mail. The
/// reference this comes from is a landing page with one headline on it — Klorn's
/// full view is three dense columns. So the sky lives *behind* the translucent
/// content panel and reads at the margins and around the chrome, and every
/// value here is deliberately low-contrast and desaturated. If you can read it
/// as "a picture" while triaging, it is too strong.
struct AmbientBackdrop: View {
    /// Honour the OS request for a plainer surface: a user who asked for
    /// reduced transparency is telling us busy backdrops cost them legibility.
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        if reduceTransparency {
            Theme.bg
        } else {
            ZStack {
                sky
                clouds
                meadow
            }
            .drawingGroup()  // flatten once; the layers never animate
            .accessibilityHidden(true)
        }
    }

    /// Deep at the top, pale at the horizon — the direction real sky runs, which
    /// is what makes a two-stop gradient read as air instead of as a swatch.
    private var sky: some View {
        LinearGradient(
            stops: [
                .init(color: Color(red: 0.784, green: 0.871, blue: 0.949), location: 0.0),
                .init(color: Color(red: 0.878, green: 0.929, blue: 0.973), location: 0.42),
                .init(color: Color(red: 0.957, green: 0.973, blue: 0.980), location: 0.78),
                .init(color: Color(red: 0.965, green: 0.976, blue: 0.965), location: 1.0),
            ],
            startPoint: .top, endPoint: .bottom)
    }

    /// Soft cumulus. Heavily blurred ellipses at low opacity: at this softness
    /// the eye reads volume without ever resolving an edge, so nothing in the
    /// backdrop can be mistaken for an interface element.
    private var clouds: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                cloud(x: 0.16 * w, y: 0.20 * h, w: 0.34 * w, h: 0.13 * h, opacity: 0.55)
                cloud(x: 0.30 * w, y: 0.29 * h, w: 0.22 * w, h: 0.09 * h, opacity: 0.40)
                cloud(x: 0.72 * w, y: 0.16 * h, w: 0.40 * w, h: 0.15 * h, opacity: 0.60)
                cloud(x: 0.88 * w, y: 0.31 * h, w: 0.26 * w, h: 0.10 * h, opacity: 0.35)
                cloud(x: 0.50 * w, y: 0.44 * h, w: 0.52 * w, h: 0.14 * h, opacity: 0.30)
            }
        }
    }

    private func cloud(
        x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, opacity: Double
    ) -> some View {
        Ellipse()
            .fill(Color.white.opacity(opacity))
            .frame(width: w, height: h)
            .blur(radius: max(18, h * 0.55))
            .position(x: x, y: y)
    }

    /// A hint of ground at the very bottom — enough to close the composition,
    /// far too soft to be a horizon line. Kept under the content panel's lower
    /// edge so it never sits behind running text.
    private var meadow: some View {
        GeometryReader { geo in
            LinearGradient(
                colors: [
                    Color(red: 0.804, green: 0.878, blue: 0.788).opacity(0.0),
                    Color(red: 0.749, green: 0.847, blue: 0.722).opacity(0.55),
                ],
                startPoint: .top, endPoint: .bottom)
                .frame(height: geo.size.height * 0.26)
                .blur(radius: 26)
                .frame(maxHeight: .infinity, alignment: .bottom)
        }
    }
}
