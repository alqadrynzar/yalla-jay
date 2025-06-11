package com.yallajay.customerapp.ui.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.yallajay.customerapp.R
import com.yallajay.customerapp.databinding.ItemStoreBinding
import com.yallajay.customerapp.model.Store

class StoreAdapter(
    private var stores: List<Store>,
    private val onItemClicked: (Store) -> Unit
) : RecyclerView.Adapter<StoreAdapter.StoreViewHolder>() {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): StoreViewHolder {
        val binding = ItemStoreBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return StoreViewHolder(binding)
    }

    override fun onBindViewHolder(holder: StoreViewHolder, position: Int) {
        val store = stores[position]
        holder.bind(store)
        holder.itemView.setOnClickListener { onItemClicked(store) }
    }

    override fun getItemCount(): Int = stores.size

    fun updateData(newStores: List<Store>) {
        this.stores = newStores
        notifyDataSetChanged() // In a real app, DiffUtil is better for performance
    }

    class StoreViewHolder(private val binding: ItemStoreBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(store: Store) {
            binding.storeNameTextView.text = store.name
            binding.storeDescriptionTextView.text = store.description

            // Load store logo from URL
            binding.storeLogoImageView.load(store.logoUrl) {
                crossfade(true)
                // You can add placeholder and error drawables here later if you want
                // placeholder(R.drawable.loading_placeholder)
                // error(R.drawable.error_placeholder)
            }

            // Set status text and background color
            val context = binding.root.context
            if (store.isCurrentlyAcceptingOrders) {
                binding.storeStatusTextView.text = "مفتوح"
                binding.storeStatusTextView.background = ContextCompat.getDrawable(context, R.drawable.status_background_open)
            } else {
                binding.storeStatusTextView.text = "مغلق"
                binding.storeStatusTextView.background = ContextCompat.getDrawable(context, R.drawable.status_background_closed)
            }
        }
    }
}
