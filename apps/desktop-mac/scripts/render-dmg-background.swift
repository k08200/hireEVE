// Render the DMG window background: brand mark + wordmark up top, a curved
// arrow from the app slot to the Applications slot below. Drawn with
// CoreGraphics so the asset is reproducible from source — no design-tool blob.
//
// usage: render-dmg-background <out-base> <mark.png>
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count == 6, let mark = NSImage(contentsOfFile: args[2]),
      let w = Double(args[3]), let h = Double(args[4]), let iconY = Double(args[5]) else {
    FileHandle.standardError.write(
        Data("usage: render-dmg-background <out-base> <mark.png> <w> <h> <icon-y>\n".utf8))
    exit(2)
}
// Geometry arrives from make-dmg.sh so the background and the .DS_Store icon
// positions cannot drift apart — they are the same numbers by construction.
let W = w, H = h
let ICON_Y_TOP = iconY

func render(scale: CGFloat, to url: URL) {
    let w = Int(W * scale), h = Int(H * scale)
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
                        bytesPerRow: 0, space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.scaleBy(x: scale, y: scale)

    // Landing palette: warm paper with a blush wash from the top.
    ctx.setFillColor(CGColor(red: 0.984, green: 0.980, blue: 0.965, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    let grad = CGGradient(colorsSpace: cs, colors: [
        CGColor(red: 0.949, green: 0.871, blue: 0.855, alpha: 0.6),
        CGColor(red: 0.984, green: 0.980, blue: 0.965, alpha: 0.0),
    ] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(grad, start: CGPoint(x: W / 2, y: H),
                           end: CGPoint(x: W / 2, y: H * 0.4), options: [])

    let gctx = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.current = gctx

    // Mark + wordmark, centred as one lockup (mark 84pt, gap 22, text ~64pt).
    let word = NSAttributedString(string: "Klorn", attributes: [
        .font: NSFont.systemFont(ofSize: 64, weight: .bold),
        .foregroundColor: NSColor(srgbRed: 0.039, green: 0.055, blue: 0.078, alpha: 1),
        .kern: -1.5,
    ])
    let markSize = 84.0, gap = 22.0
    let textSize = word.size()
    let total = markSize + gap + textSize.width
    let x0 = (W - total) / 2
    let lockupCenterY = H - (ICON_Y_TOP * 0.42)   // sits in the upper third, follows the icons
    mark.draw(in: CGRect(x: x0, y: lockupCenterY - markSize / 2,
                         width: markSize, height: markSize))
    word.draw(at: CGPoint(x: x0 + markSize + gap,
                          y: lockupCenterY - textSize.height / 2 + 2))

    // Curved arrow between the icon slots (centres x=180 / x=480, icon 128 —
    // draw between the edges with a gentle lift, like a hand gesture).
    let y = H - ICON_Y_TOP
    ctx.setStrokeColor(CGColor(red: 0.16, green: 0.19, blue: 0.23, alpha: 0.85))
    ctx.setLineWidth(3.5)
    ctx.setLineCap(.round)
    ctx.move(to: CGPoint(x: 262, y: y - 6))
    ctx.addCurve(to: CGPoint(x: 396, y: y + 2),
                 control1: CGPoint(x: 300, y: y + 34),
                 control2: CGPoint(x: 356, y: y + 30))
    ctx.strokePath()
    ctx.move(to: CGPoint(x: 380, y: y + 16)); ctx.addLine(to: CGPoint(x: 398, y: y + 2))
    ctx.addLine(to: CGPoint(x: 378, y: y - 4))
    ctx.strokePath()

    NSGraphicsContext.current = nil
    let img = ctx.makeImage()!
    let rep = NSBitmapImageRep(cgImage: img)
    rep.size = NSSize(width: W, height: H)
    try! rep.representation(using: .png, properties: [:])!.write(to: url)
}

let base = args[1]
render(scale: 1, to: URL(fileURLWithPath: base + ".png"))
render(scale: 2, to: URL(fileURLWithPath: base + "@2x.png"))
print("wrote \(base).png / @2x.png")
